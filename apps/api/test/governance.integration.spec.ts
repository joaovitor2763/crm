import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	AccessScope,
	AuditActorType,
	db,
	LifecycleStage,
	PermissionAction,
	UserAccessStatus,
} from "@crm/db";
import { CRM_RESOURCE } from "../src/access-control/access-control.constants";
import { AccessControlService } from "../src/access-control/access-control.service";
import type { EffectivePrincipal } from "../src/access-control/access-control.types";
import { ContactLifecycleService } from "../src/contacts/contact-lifecycle.service";
import { GovernanceService } from "../src/governance/governance.service";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID().slice(0, 8);
const adminUserId = `governance-admin-${suffix}`;
const repUserId = `governance-rep-${suffix}`;
const newUserId = `governance-new-${suffix}`;
const parentKey = `governance-parent-${suffix}`;
const childKey = `governance-child-${suffix}`;
const teamKey = `governance-team-${suffix}`;
const contactId = `governance-contact-${suffix}`;

let access: AccessControlService;
let governance: GovernanceService;
let lifecycle: ContactLifecycleService;
let admin: EffectivePrincipal;
let parentUnitId: string;
let childUnitId: string;
let teamId: string;

async function cleanup() {
	await db.auditEvent.deleteMany({
		where: {
			OR: [
				{ actorId: { in: [adminUserId, repUserId, newUserId] } },
				{ recordId: contactId },
			],
		},
	});
	await db.domainEvent.deleteMany({ where: { recordId: contactId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.team.deleteMany({ where: { key: teamKey } });
	await db.businessUnit.deleteMany({
		where: { key: { in: [childKey, parentKey] } },
	});
	await db.user.deleteMany({
		where: { id: { in: [adminUserId, repUserId, newUserId] } },
	});
}

beforeAll(async () => {
	await cleanup();
	access = new AccessControlService(db);
	governance = new GovernanceService(db);
	lifecycle = new ContactLifecycleService(db);
	await db.user.createMany({
		data: [
			{
				id: adminUserId,
				name: "Governance Test Admin",
				email: `${adminUserId}@example.test`,
			},
			{
				id: repUserId,
				name: "Governance Test Rep",
				email: `${repUserId}@example.test`,
			},
			{
				id: newUserId,
				name: "Governance New User",
				email: `${newUserId}@example.test`,
			},
		],
	});
	await db.userAccess.create({
		data: {
			userId: adminUserId,
			roleId: "role-global-admin",
			primaryBusinessUnitId: "business-unit-default",
			primaryTeamId: "team-default",
		},
	});
	await db.businessUnitMembership.create({
		data: {
			userId: adminUserId,
			businessUnitId: "business-unit-default",
			type: "ADMIN",
		},
	});
	await db.teamMembership.create({
		data: { userId: adminUserId, teamId: "team-default", isLead: true },
	});
	admin = await access.forUser(adminUserId);

	const parent = await governance.createBusinessUnit(
		{ name: "Governance Parent", key: parentKey },
		admin,
	);
	parentUnitId = parent.id;
	const child = await governance.createBusinessUnit(
		{ name: "Governance Child", key: childKey, parentId: parent.id },
		admin,
	);
	childUnitId = child.id;
	const team = await governance.createTeam(
		{
			name: "Governance Team",
			key: teamKey,
			businessUnitId: child.id,
		},
		admin,
	);
	teamId = team.id;
});

afterAll(cleanup);

describe("governance and lifecycle", () => {
	it("assigns a new identity read-only instead of granting broad access", async () => {
		const principals = await Promise.all(
			Array.from({ length: 8 }, () => access.forUser(newUserId)),
		);
		const principal = principals[0];
		if (!principal) throw new Error("Expected a resolved principal.");
		expect(
			principals.every((candidate) => candidate.roleKey === "read-only"),
		).toBe(true);
		expect(principal.roleKey).toBe("read-only");
		expect(principal.status).toBe(UserAccessStatus.ACTIVE);
		expect(
			access.permission(
				principal,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
			),
		).toBe(AccessScope.BUSINESS_UNIT);
		expect(
			access.permission(
				principal,
				CRM_RESOURCE.contacts,
				PermissionAction.UPDATE,
			),
		).toBe(AccessScope.NONE);
	});

	it("resolves a unit tree and team visibility independently from the role", async () => {
		await governance.setUserAccess(
			{
				userId: repUserId,
				roleId: "role-sales-representative",
				status: UserAccessStatus.ACTIVE,
				primaryBusinessUnitId: childUnitId,
				primaryTeamId: teamId,
				businessUnitIds: [parentUnitId],
				teamIds: [teamId],
				managedTeamIds: [],
			},
			admin,
		);
		const rep = await access.forUser(repUserId);
		expect(rep.businessUnitIds).toContain(parentUnitId);
		expect(rep.businessUnitTreeIds).toContain(childUnitId);
		expect(rep.teamIds).toEqual([teamId]);
		expect(
			access.permission(rep, CRM_RESOURCE.deals, PermissionAction.READ),
		).toBe(AccessScope.TEAM);
	});

	it("keeps MQL per unit and consolidates the highest global lifecycle", async () => {
		await db.contact.create({
			data: {
				id: contactId,
				firstName: "Governance",
				lastName: "Contact",
				email: `${contactId}@example.test`,
			},
		});

		const first = await lifecycle.setLifecycle(
			{
				contactId,
				businessUnitId: parentUnitId,
				lifecycleStage: LifecycleStage.MQL,
				marketingScore: 82,
				qualificationReason: "Matched the parent unit ICP",
			},
			admin,
		);
		expect(first.newlyQualified).toBe(true);
		expect(first.globalLifecycleStage).toBe(LifecycleStage.MQL);

		const second = await lifecycle.setLifecycle(
			{
				contactId,
				businessUnitId: childUnitId,
				teamId,
				lifecycleStage: LifecycleStage.SQL,
				marketingScore: 91,
				qualificationReason: "Sales accepted the child-unit lead",
			},
			admin,
		);
		expect(second.globalLifecycleStage).toBe(LifecycleStage.SQL);
		expect(second.globalMarketingScore).toBe("91");

		await lifecycle.setLifecycle(
			{
				contactId,
				businessUnitId: childUnitId,
				teamId,
				lifecycleStage: LifecycleStage.LEAD,
			},
			admin,
		);
		const contact = await db.contact.findUniqueOrThrow({
			where: { id: contactId },
			include: { unitStates: { orderBy: { businessUnitId: "asc" } } },
		});
		expect(contact.globalLifecycleStage).toBe(LifecycleStage.MQL);
		expect(contact.globallyMarketingQualifiedAt).not.toBeNull();
		expect(
			contact.unitStates.find((state) => state.businessUnitId === childUnitId)
				?.lifecycleStage,
		).toBe(LifecycleStage.LEAD);
		expect(
			contact.unitStates.find((state) => state.businessUnitId === parentUnitId)
				?.lifecycleStage,
		).toBe(LifecycleStage.MQL);
	});

	it("records the actor and unit without customer payloads in the audit log", async () => {
		const event = await db.auditEvent.findFirstOrThrow({
			where: {
				recordId: contactId,
				action: "contact.became-mql",
				businessUnitId: parentUnitId,
			},
			orderBy: { createdAt: "asc" },
		});
		expect(event.actorType).toBe(AuditActorType.USER);
		expect(event.actorId).toBe(adminUserId);
		expect(event.metadata).toMatchObject({
			from: null,
			to: LifecycleStage.MQL,
			newlyQualified: true,
		});
	});
});
