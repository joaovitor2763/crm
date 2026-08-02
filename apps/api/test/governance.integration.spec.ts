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
import {
	assertCurrentUserInScope,
	assertRoleAssignable,
	teamIdsForScope,
} from "../src/governance/governance-scope";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID().slice(0, 8);
const adminUserId = `governance-admin-${suffix}`;
const repUserId = `governance-rep-${suffix}`;
const newUserId = `governance-new-${suffix}`;
const unassignedUserId = `governance-unassigned-${suffix}`;
const scopedUnassignedUserId = `governance-scoped-unassigned-${suffix}`;
const outsideUnassignedUserId = `governance-outside-unassigned-${suffix}`;
const teamOnlyUserId = `governance-team-only-${suffix}`;
const scopedAdminUserId = `governance-scoped-admin-${suffix}`;
const outsideUserId = `governance-outside-${suffix}`;
const parentKey = `governance-parent-${suffix}`;
const childKey = `governance-child-${suffix}`;
const outsideKey = `governance-outside-unit-${suffix}`;
const teamKey = `governance-team-${suffix}`;
const outsideTeamKey = `governance-outside-team-${suffix}`;
const teamDestinationKey = `governance-team-destination-${suffix}`;
const contactId = `governance-contact-${suffix}`;

let access: AccessControlService;
let governance: GovernanceService;
let lifecycle: ContactLifecycleService;
let admin: EffectivePrincipal;
let scopedAdmin: EffectivePrincipal;
let parentUnitId: string;
let childUnitId: string;
let teamId: string;
let outsideUnitId: string;
let outsideTeamId: string;

async function cleanup() {
	await db.auditEvent.deleteMany({
		where: {
			OR: [
				{
					actorId: {
						in: [
							adminUserId,
							repUserId,
							newUserId,
							scopedAdminUserId,
							outsideUserId,
						],
					},
				},
				{ recordId: contactId },
			],
		},
	});
	await db.domainEvent.deleteMany({ where: { recordId: contactId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.team.deleteMany({
		where: { key: { in: [teamKey, outsideTeamKey, teamDestinationKey] } },
	});
	await db.businessUnit.deleteMany({
		where: { key: { in: [childKey, parentKey, outsideKey] } },
	});
	await db.user.deleteMany({
		where: {
			id: {
				in: [
					adminUserId,
					repUserId,
					newUserId,
					unassignedUserId,
					scopedUnassignedUserId,
					outsideUnassignedUserId,
					teamOnlyUserId,
					scopedAdminUserId,
					outsideUserId,
				],
			},
		},
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
			{
				id: unassignedUserId,
				name: "Governance Unassigned User",
				email: `${unassignedUserId}@example.test`,
			},
			{
				id: scopedUnassignedUserId,
				name: "Governance Scoped Unassigned User",
				email: `${scopedUnassignedUserId}@example.test`,
			},
			{
				id: outsideUnassignedUserId,
				name: "Governance Outside Unassigned User",
				email: `${outsideUnassignedUserId}@example.test`,
			},
			{
				id: teamOnlyUserId,
				name: "Governance Team Only User",
				email: `${teamOnlyUserId}@example.test`,
			},
			{
				id: scopedAdminUserId,
				name: "Governance Scoped Admin",
				email: `${scopedAdminUserId}@example.test`,
			},
			{
				id: outsideUserId,
				name: "Governance Outside User",
				email: `${outsideUserId}@example.test`,
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
	const outside = await governance.createBusinessUnit(
		{
			name: "Governance Outside",
			key: outsideKey,
			parentId: "business-unit-default",
		},
		admin,
	);
	outsideUnitId = outside.id;
	const outsideTeam = await governance.createTeam(
		{
			name: "Governance Outside Team",
			key: outsideTeamKey,
			businessUnitId: outside.id,
		},
		admin,
	);
	outsideTeamId = outsideTeam.id;
	await governance.setUserAccess(
		{
			userId: scopedAdminUserId,
			roleId: "role-business-unit-admin",
			status: UserAccessStatus.ACTIVE,
			primaryBusinessUnitId: childUnitId,
			primaryTeamId: teamId,
			businessUnitIds: [parentUnitId],
			teamIds: [teamId],
			managedTeamIds: [],
		},
		admin,
	);
	await db.userAccess.create({
		data: {
			userId: teamOnlyUserId,
			roleId: "role-sales-representative",
			primaryTeamId: teamId,
		},
	});
	await db.teamMembership.create({
		data: { userId: teamOnlyUserId, teamId },
	});
	await db.businessUnitMembership.create({
		data: { userId: scopedUnassignedUserId, businessUnitId: parentUnitId },
	});
	await db.businessUnitMembership.create({
		data: { userId: outsideUnassignedUserId, businessUnitId: outsideUnitId },
	});
	scopedAdmin = await access.forUser(scopedAdminUserId);
	await governance.setUserAccess(
		{
			userId: outsideUserId,
			roleId: "role-sales-representative",
			status: UserAccessStatus.ACTIVE,
			primaryBusinessUnitId: outsideUnitId,
			primaryTeamId: outsideTeamId,
			businessUnitIds: [outsideUnitId],
			teamIds: [outsideTeamId],
			managedTeamIds: [],
		},
		admin,
	);
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

	it("fails closed when an external OWNED principal has no user identity", async () => {
		const externalOwned: EffectivePrincipal = {
			actorType: AuditActorType.API_KEY,
			actorId: "governance-external-owned",
			userId: null,
			roleId: "governance-owned-role",
			roleKey: "governance-owned-role",
			isAdmin: false,
			status: UserAccessStatus.ACTIVE,
			primaryBusinessUnitId: null,
			primaryTeamId: null,
			businessUnitIds: [],
			businessUnitTreeIds: [],
			teamIds: [],
			managedTeamIds: [],
			teamAssignments: [],
			ownerAssignments: [],
			permissions: [
				{
					resource: CRM_RESOURCE.contacts,
					action: PermissionAction.READ,
					scope: AccessScope.OWNED,
				},
				{
					resource: CRM_RESOURCE.companies,
					action: PermissionAction.READ,
					scope: AccessScope.OWNED,
				},
				{
					resource: CRM_RESOURCE.deals,
					action: PermissionAction.READ,
					scope: AccessScope.OWNED,
				},
				{
					resource: CRM_RESOURCE.activities,
					action: PermissionAction.READ,
					scope: AccessScope.OWNED,
				},
			],
			fieldPermissions: [],
		};

		expect(
			access.contactWhere(
				externalOwned,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
			),
		).toEqual({ id: { in: [] } });
		expect(
			access.companyWhere(
				externalOwned,
				CRM_RESOURCE.companies,
				PermissionAction.READ,
			),
		).toEqual({ id: { in: [] } });
		expect(
			access.dealWhere(
				externalOwned,
				CRM_RESOURCE.deals,
				PermissionAction.READ,
			),
		).toEqual({ id: { in: [] } });
		expect(
			access.activityWhere(
				externalOwned,
				CRM_RESOURCE.activities,
				PermissionAction.READ,
			),
		).toEqual({ id: { in: [] } });
		await expect(
			access.assertAssignment(
				externalOwned,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
				{},
			),
		).rejects.toThrow();
	});

	it("only bypasses unassigned users without memberships", () => {
		const unassigned = {
			id: unassignedUserId,
			access: null,
			businessUnitMemberships: [],
			teamMemberships: [],
		};
		expect(() =>
			assertCurrentUserInScope(scopedAdmin, unassigned, true),
		).not.toThrow();
		expect(() =>
			assertCurrentUserInScope(
				scopedAdmin,
				{
					...unassigned,
					businessUnitMemberships: [{ businessUnitId: outsideUnitId }],
				},
				true,
			),
		).toThrow();
		expect(() =>
			assertCurrentUserInScope(
				scopedAdmin,
				{
					...unassigned,
					teamMemberships: [{ teamId: outsideTeamId }],
				},
				true,
			),
		).toThrow();

		const usersTeamScoped = {
			...scopedAdmin,
			permissions: scopedAdmin.permissions.map((permission) =>
				permission.resource === CRM_RESOURCE.users &&
				permission.action === PermissionAction.MANAGE
					? { ...permission, scope: AccessScope.TEAM }
					: permission.resource === CRM_RESOURCE.teams &&
							permission.action === PermissionAction.MANAGE
						? { ...permission, scope: AccessScope.ALL }
						: permission,
			),
		};
		expect(() =>
			assertCurrentUserInScope(usersTeamScoped, {
				id: outsideUserId,
				access: {
					role: { isAdmin: false },
					primaryBusinessUnitId: outsideUnitId,
					primaryTeamId: outsideTeamId,
				},
				businessUnitMemberships: [{ businessUnitId: outsideUnitId }],
				teamMemberships: [{ teamId: outsideTeamId }],
			}),
		).toThrow();
	});

	it("keeps a business-unit administrator inside its tree", async () => {
		expect(teamIdsForScope(scopedAdmin, AccessScope.NONE, null)).toEqual([]);
		const scopedOverview = await governance.overview(scopedAdmin);
		expect(scopedOverview.businessUnits.map((unit) => unit.id)).toEqual(
			expect.arrayContaining([parentUnitId, childUnitId]),
		);
		expect(scopedOverview.businessUnits.map((unit) => unit.id)).not.toContain(
			outsideUnitId,
		);
		expect(scopedOverview.roles.every((role) => !role.isAdmin)).toBe(true);
		expect(scopedOverview.users.map((user) => user.id)).toContain(
			scopedAdminUserId,
		);
		expect(scopedOverview.users.map((user) => user.id)).toContain(
			teamOnlyUserId,
		);
		expect(scopedOverview.users.map((user) => user.id)).toContain(
			unassignedUserId,
		);
		expect(scopedOverview.users.map((user) => user.id)).toContain(
			scopedUnassignedUserId,
		);
		const unassignedUser = scopedOverview.users.find(
			(user) => user.id === unassignedUserId,
		);
		expect(unassignedUser?.access).toBeNull();
		expect(unassignedUser?.businessUnitMemberships).toEqual([]);
		expect(unassignedUser?.teamMemberships).toEqual([]);
		const scopedUnassignedUser = scopedOverview.users.find(
			(user) => user.id === scopedUnassignedUserId,
		);
		expect(scopedUnassignedUser?.access).toBeNull();
		expect(scopedUnassignedUser?.businessUnitMemberships).toEqual([
			{ businessUnitId: parentUnitId, type: "MEMBER" },
		]);
		expect(scopedOverview.users.map((user) => user.id)).not.toContain(
			outsideUnassignedUserId,
		);
		expect(scopedOverview.users.map((user) => user.id)).not.toContain(
			outsideUserId,
		);

		const globalOverview = await governance.overview(admin);
		expect(globalOverview.businessUnits.map((unit) => unit.id)).toContain(
			outsideUnitId,
		);
		expect(globalOverview.roles.some((role) => role.isAdmin)).toBe(true);
		const directScope = {
			...scopedAdmin,
			businessUnitIds: [parentUnitId],
			businessUnitTreeIds: [parentUnitId, childUnitId],
			permissions: scopedAdmin.permissions.map((permission) =>
				(permission.resource === CRM_RESOURCE.businessUnits ||
					permission.resource === CRM_RESOURCE.teams ||
					permission.resource === CRM_RESOURCE.users) &&
				permission.action === PermissionAction.MANAGE
					? { ...permission, scope: AccessScope.BUSINESS_UNIT }
					: permission,
			),
		};
		const directOverview = await governance.overview(directScope);
		expect(directOverview.businessUnits.map((unit) => unit.id)).toContain(
			parentUnitId,
		);
		expect(directOverview.businessUnits.map((unit) => unit.id)).not.toContain(
			childUnitId,
		);
		const independentOverview = await governance.overview({
			...scopedAdmin,
			businessUnitIds: [parentUnitId],
			permissions: scopedAdmin.permissions.map((permission) => {
				if (
					permission.resource === CRM_RESOURCE.businessUnits &&
					permission.action === PermissionAction.MANAGE
				) {
					return { ...permission, scope: AccessScope.BUSINESS_UNIT_TREE };
				}
				if (
					permission.resource === CRM_RESOURCE.teams &&
					permission.action === PermissionAction.MANAGE
				) {
					return { ...permission, scope: AccessScope.BUSINESS_UNIT };
				}
				return permission;
			}),
		});
		const childUnit = independentOverview.businessUnits.find(
			(unit) => unit.id === childUnitId,
		);
		expect(childUnit?.teams.map((team) => team.id)).not.toContain(teamId);

		await governance.setUserAccess(
			{
				userId: repUserId,
				roleId: "role-sales-representative",
				status: UserAccessStatus.ACTIVE,
				primaryBusinessUnitId: childUnitId,
				primaryTeamId: teamId,
				businessUnitIds: [parentUnitId, outsideUnitId],
				teamIds: [teamId, outsideTeamId],
				managedTeamIds: [],
			},
			admin,
		);
		await expect(
			governance.setUserAccess(
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
				scopedAdmin,
			),
		).rejects.toThrow();
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
		const usersWithoutTeamScope = {
			...scopedAdmin,
			permissions: scopedAdmin.permissions.filter(
				(permission) =>
					!(
						permission.resource === CRM_RESOURCE.teams &&
						permission.action === PermissionAction.MANAGE
					),
			),
		};
		await expect(
			governance.setUserAccess(
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
				usersWithoutTeamScope,
			),
		).rejects.toThrow();

		const teamScoped = {
			...scopedAdmin,
			businessUnitIds: [],
			businessUnitTreeIds: [],
			permissions: scopedAdmin.permissions.map((permission) =>
				permission.resource === CRM_RESOURCE.teams &&
				permission.action === PermissionAction.MANAGE
					? { ...permission, scope: AccessScope.TEAM }
					: permission,
			),
		};
		const userTeamScoped = {
			...scopedAdmin,
			permissions: scopedAdmin.permissions.map((permission) => {
				if (
					permission.action === PermissionAction.MANAGE &&
					permission.resource === CRM_RESOURCE.users
				) {
					return { ...permission, scope: AccessScope.TEAM };
				}
				if (
					permission.action === PermissionAction.MANAGE &&
					(permission.resource === CRM_RESOURCE.teams ||
						permission.resource === CRM_RESOURCE.businessUnits)
				) {
					return { ...permission, scope: AccessScope.ALL };
				}
				return permission;
			}),
		};
		await expect(
			governance.setUserAccess(
				{
					userId: repUserId,
					roleId: "role-sales-representative",
					status: UserAccessStatus.ACTIVE,
					primaryBusinessUnitId: outsideUnitId,
					primaryTeamId: outsideTeamId,
					businessUnitIds: [outsideUnitId],
					teamIds: [outsideTeamId],
					managedTeamIds: [],
				},
				userTeamScoped,
			),
		).rejects.toThrow();
		await governance.updateTeam(
			{ id: teamId, name: "Governance Team" },
			teamScoped,
		);
		const managedTeamScoped = {
			...teamScoped,
			teamIds: [],
			managedTeamIds: [teamId],
			permissions: teamScoped.permissions.map((permission) =>
				permission.resource === CRM_RESOURCE.teams &&
				permission.action === PermissionAction.MANAGE
					? { ...permission, scope: AccessScope.MANAGED_TEAMS }
					: permission,
			),
		};
		await governance.updateTeam(
			{ id: teamId, name: "Governance Team" },
			managedTeamScoped,
		);

		await expect(
			governance.createBusinessUnit(
				{
					name: "Outside Child Attempt",
					key: `governance-outside-child-${suffix}`,
					parentId: "business-unit-default",
				},
				scopedAdmin,
			),
		).rejects.toThrow();
		await expect(
			governance.updateBusinessUnit(
				{ id: outsideUnitId, name: "Outside Update Attempt" },
				scopedAdmin,
			),
		).rejects.toThrow();
		await expect(
			governance.createTeam(
				{
					name: "Outside Team Attempt",
					key: `governance-outside-team-attempt-${suffix}`,
					businessUnitId: outsideUnitId,
				},
				scopedAdmin,
			),
		).rejects.toThrow();
		const teamScopedDestination = {
			...scopedAdmin,
			permissions: scopedAdmin.permissions.map((permission) => {
				if (
					permission.resource === CRM_RESOURCE.businessUnits &&
					permission.action === PermissionAction.MANAGE
				) {
					return { ...permission, scope: AccessScope.NONE };
				}
				if (
					permission.resource === CRM_RESOURCE.teams &&
					permission.action === PermissionAction.MANAGE
				) {
					return { ...permission, scope: AccessScope.BUSINESS_UNIT_TREE };
				}
				return permission;
			}),
		};
		await expect(
			governance.createTeam(
				{
					name: "Team Scope Destination",
					key: teamDestinationKey,
					businessUnitId: childUnitId,
				},
				teamScopedDestination,
			),
		).resolves.toMatchObject({ businessUnitId: childUnitId });
		const businessUnitOnly = {
			...scopedAdmin,
			permissions: scopedAdmin.permissions.map((permission) =>
				permission.resource === CRM_RESOURCE.teams &&
				permission.action === PermissionAction.MANAGE
					? { ...permission, scope: AccessScope.NONE }
					: permission,
			),
		};
		await expect(
			governance.createTeam(
				{
					name: "Business Unit Scope Only",
					key: `governance-team-business-unit-only-${suffix}`,
					businessUnitId: childUnitId,
				},
				businessUnitOnly,
			),
		).rejects.toThrow();
		await expect(
			governance.updateTeam(
				{ id: outsideTeamId, name: "Outside Team Update Attempt" },
				scopedAdmin,
			),
		).rejects.toThrow();
		await expect(
			governance.setUserAccess(
				{
					userId: scopedAdminUserId,
					roleId: "role-global-admin",
					status: UserAccessStatus.ACTIVE,
					primaryBusinessUnitId: childUnitId,
					primaryTeamId: teamId,
					businessUnitIds: [parentUnitId],
					teamIds: [teamId],
					managedTeamIds: [],
				},
				scopedAdmin,
			),
		).rejects.toThrow();
		await expect(
			governance.setUserAccess(
				{
					userId: outsideUserId,
					roleId: "role-sales-representative",
					status: UserAccessStatus.ACTIVE,
					primaryBusinessUnitId: outsideUnitId,
					primaryTeamId: outsideTeamId,
					businessUnitIds: [outsideUnitId],
					teamIds: [outsideTeamId],
					managedTeamIds: [],
				},
				scopedAdmin,
			),
		).rejects.toThrow();
	});

	it("restricts shared role administration to Global Admin", async () => {
		const ceilingCases = [
			[AccessScope.TEAM, AccessScope.BUSINESS_UNIT, false],
			[AccessScope.BUSINESS_UNIT, AccessScope.BUSINESS_UNIT_TREE, false],
			[AccessScope.BUSINESS_UNIT_TREE, AccessScope.BUSINESS_UNIT, true],
			[AccessScope.MANAGED_TEAMS, AccessScope.TEAM, false],
			[AccessScope.TEAM, AccessScope.OWNED, true],
		] as const;
		for (const [actorScope, candidateScope, allowed] of ceilingCases) {
			const principal = {
				...scopedAdmin,
				permissions: [
					{
						resource: CRM_RESOURCE.deals,
						action: PermissionAction.CREATE,
						scope: actorScope,
					},
				],
			};
			const attempt = () =>
				assertRoleAssignable(principal, {
					isAdmin: false,
					permissions: [
						{
							resource: CRM_RESOURCE.deals,
							action: PermissionAction.CREATE,
							scope: candidateScope,
						},
					],
					fieldPermissions: [],
				});
			if (allowed) expect(attempt).not.toThrow();
			else expect(attempt).toThrow();
		}
		const fieldId = "governance-sensitive-field";
		const fieldRestrictedPrincipal = {
			...scopedAdmin,
			fieldPermissions: [{ fieldId, canRead: false, canUpdate: false }],
		};
		const roleWithoutFieldOverride = {
			isAdmin: false,
			permissions: [],
			fieldPermissions: [],
		};
		const roleMirroringFieldDenials = {
			...roleWithoutFieldOverride,
			fieldPermissions: [{ fieldId, canRead: false, canUpdate: false }],
		};
		expect(() =>
			assertRoleAssignable(fieldRestrictedPrincipal, roleWithoutFieldOverride),
		).toThrow();
		expect(() =>
			assertRoleAssignable(fieldRestrictedPrincipal, roleMirroringFieldDenials),
		).not.toThrow();
		expect(() =>
			assertRoleAssignable(fieldRestrictedPrincipal, {
				...roleWithoutFieldOverride,
				fieldPermissions: [{ fieldId, canRead: false, canUpdate: true }],
			}),
		).toThrow();
		const persistedFieldId = `governance-field-${suffix}`;
		const persistedRoleId = `governance-field-role-${suffix}`;
		await db.customFieldDefinition.create({
			data: {
				id: persistedFieldId,
				objectDefinitionId: "object-contact",
				key: `governance-field-${suffix}`,
				label: "Governance Field",
				type: "TEXT",
			},
		});
		await db.role.create({
			data: {
				id: persistedRoleId,
				key: `governance-field-role-${suffix}`,
				name: "Governance Field Role",
			},
		});
		await db.fieldPermission.create({
			data: {
				roleId: persistedRoleId,
				fieldId: persistedFieldId,
				canRead: true,
				canUpdate: true,
			},
		});
		try {
			await expect(
				governance.setUserAccess(
					{
						userId: repUserId,
						roleId: persistedRoleId,
						status: UserAccessStatus.ACTIVE,
						primaryBusinessUnitId: childUnitId,
						primaryTeamId: teamId,
						businessUnitIds: [parentUnitId],
						teamIds: [teamId],
						managedTeamIds: [],
					},
					{
						...fieldRestrictedPrincipal,
						fieldPermissions: [
							{ fieldId: persistedFieldId, canRead: false, canUpdate: false },
						],
					},
				),
			).rejects.toThrow();
		} finally {
			await db.role.delete({ where: { id: persistedRoleId } });
			await db.customFieldDefinition.delete({
				where: { id: persistedFieldId },
			});
		}
		await expect(
			governance.createRole(
				{
					name: "Scoped Role Attempt",
					key: `governance-scoped-role-${suffix}`,
				},
				scopedAdmin,
			),
		).rejects.toThrow();
		await expect(
			governance.updateRole(
				{ id: "role-sales-representative", name: "Scoped Role Update" },
				scopedAdmin,
			),
		).rejects.toThrow();
		await expect(
			governance.setRolePermission(
				{
					roleId: "role-sales-representative",
					resource: CRM_RESOURCE.deals,
					action: PermissionAction.READ,
					scope: AccessScope.BUSINESS_UNIT_TREE,
				},
				scopedAdmin,
			),
		).rejects.toThrow();
		await expect(
			governance.setUserAccess(
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
				scopedAdmin,
			),
		).resolves.toEqual({ userId: repUserId });
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
		expect(rep.ownerAssignments.map((owner) => owner.userId)).toEqual([
			repUserId,
		]);
		expect(
			access.permission(rep, CRM_RESOURCE.deals, PermissionAction.READ),
		).toBe(AccessScope.TEAM);
		await expect(
			access.assertAssignment(
				rep,
				CRM_RESOURCE.deals,
				PermissionAction.CREATE,
				{
					ownerId: repUserId,
					businessUnitId: childUnitId,
					teamId,
				},
			),
		).resolves.toBeUndefined();
		await expect(
			access.assertAssignment(
				rep,
				CRM_RESOURCE.deals,
				PermissionAction.CREATE,
				{
					ownerId: outsideUserId,
					businessUnitId: childUnitId,
					teamId,
				},
			),
		).rejects.toThrow();
		const ownedScope = {
			...rep,
			permissions: rep.permissions.map((permission) =>
				permission.resource === CRM_RESOURCE.deals &&
				permission.action === PermissionAction.CREATE
					? { ...permission, scope: AccessScope.OWNED }
					: permission,
			),
		};
		await expect(
			access.assertAssignment(
				ownedScope,
				CRM_RESOURCE.deals,
				PermissionAction.CREATE,
				{ teamId, businessUnitId: childUnitId },
			),
		).resolves.toBeUndefined();
		await expect(
			access.assertAssignment(
				ownedScope,
				CRM_RESOURCE.deals,
				PermissionAction.CREATE,
				{ teamId, businessUnitId: childUnitId, ownerId: null },
			),
		).rejects.toThrow();
		const allScope = {
			...rep,
			isAdmin: false,
			teamAssignments: [],
			ownerAssignments: [],
			permissions: rep.permissions.map((permission) =>
				permission.resource === CRM_RESOURCE.deals &&
				permission.action === PermissionAction.CREATE
					? { ...permission, scope: AccessScope.ALL }
					: permission,
			),
		};
		await expect(
			access.assertAssignment(
				allScope,
				CRM_RESOURCE.deals,
				PermissionAction.CREATE,
				{
					ownerId: "outside-owner",
					businessUnitId: "outside-root",
					teamId: "outside-team",
				},
			),
		).resolves.toBeUndefined();
		await expect(
			access.assertAssignment(
				{
					...allScope,
					ownerAssignments: [
						{
							userId: "known-owner",
							businessUnitIds: ["known-unit"],
							teamIds: ["known-team"],
						},
					],
				},
				CRM_RESOURCE.deals,
				PermissionAction.CREATE,
				{
					ownerId: "known-owner",
					businessUnitId: "outside-root",
					teamId: "outside-team",
				},
			),
		).resolves.toBeUndefined();
		await expect(
			access.assertAssignment(
				{
					...allScope,
					teamAssignments: [
						{ teamId: "known-team", businessUnitId: "known-unit" },
					],
				},
				CRM_RESOURCE.deals,
				PermissionAction.CREATE,
				{
					teamId,
					businessUnitId: "wrong-unit",
				},
			),
		).rejects.toThrow();
		const businessUnitScoped = {
			...rep,
			businessUnitIds: [parentUnitId],
			permissions: rep.permissions.map((permission) =>
				permission.resource === CRM_RESOURCE.deals &&
				permission.action === PermissionAction.CREATE
					? { ...permission, scope: AccessScope.BUSINESS_UNIT }
					: permission,
			),
		};
		await expect(
			access.assertAssignment(
				businessUnitScoped,
				CRM_RESOURCE.deals,
				PermissionAction.CREATE,
				{
					ownerId: repUserId,
					businessUnitId: parentUnitId,
					teamId,
				},
			),
		).rejects.toThrow();
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
