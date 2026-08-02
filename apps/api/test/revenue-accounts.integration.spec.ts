import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AccessControlService } from "../src/access-control/access-control.service";
import { FieldsService } from "../src/fields/fields.service";
import { RevenueAccountsService } from "../src/revenue-accounts/revenue-accounts.service";

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `revenue-account-test-${suffix}`;
const companyId = `revenue-company-test-${suffix}`;
const contactId = `revenue-contact-test-${suffix}`;
const fieldKey = `segment_${suffix}`;

let service: RevenueAccountsService;
let principal: Awaited<ReturnType<AccessControlService["forUser"]>>;
let fieldId: string;
let sourceId: string;
let targetId: string;

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Revenue Account Test Admin",
			email: `${userId}@example.test`,
		},
	});
	await db.userAccess.create({
		data: {
			userId,
			roleId: "role-global-admin",
			primaryBusinessUnitId: "business-unit-default",
			primaryTeamId: "team-default",
		},
	});
	await db.businessUnitMembership.create({
		data: { userId, businessUnitId: "business-unit-default", type: "ADMIN" },
	});
	await db.teamMembership.create({
		data: { userId, teamId: "team-default", isLead: true },
	});
	const access = new AccessControlService(db);
	principal = await access.forUser(userId);
	const fields = new FieldsService(db, access);
	service = new RevenueAccountsService(db, access, fields);
	await service.updateConfiguration(
		{
			enabled: true,
			relations: [
				{
					targetKind: "CONTACT",
					cardinality: "MANY_TO_MANY",
					attachEnabled: true,
					detachEnabled: true,
				},
				{
					targetKind: "COMPANY",
					cardinality: "MANY_TO_MANY",
					attachEnabled: true,
					detachEnabled: true,
				},
				{
					targetKind: "DEAL",
					cardinality: "MANY_TO_MANY",
					attachEnabled: true,
					detachEnabled: true,
				},
			],
			mergePolicy: {},
		},
		principal,
	);
	fieldId = `revenue-field-${suffix}`;
	await db.customFieldDefinition.create({
		data: {
			id: fieldId,
			objectDefinitionId: "object-revenue-account",
			key: fieldKey,
			label: "Segment",
			type: "TEXT",
			apiReadable: true,
			apiWritable: true,
		},
	});
	await db.company.create({
		data: { id: companyId, name: "Revenue Test Company" },
	});
	await db.contact.create({
		data: { id: contactId, firstName: "Revenue", lastName: "Contact" },
	});
});

afterAll(async () => {
	await db.revenueAccountMerge.deleteMany({
		where: {
			OR: [{ sourceAccountId: sourceId }, { targetAccountId: targetId }],
		},
	});
	await db.revenueAccountLineageEvent.deleteMany({
		where: { revenueAccountId: { in: [sourceId, targetId] } },
	});
	await db.revenueAccountAttributeHistory.deleteMany({
		where: { revenueAccountId: { in: [sourceId, targetId] } },
	});
	await db.revenueAccountContact.deleteMany({
		where: { revenueAccountId: { in: [sourceId, targetId] } },
	});
	await db.revenueAccountCompany.deleteMany({
		where: { revenueAccountId: { in: [sourceId, targetId] } },
	});
	await db.revenueAccountDeal.deleteMany({
		where: { revenueAccountId: { in: [sourceId, targetId] } },
	});
	await db.revenueAccount.deleteMany({
		where: { id: { in: [sourceId, targetId] } },
	});
	await db.customFieldDefinition.delete({ where: { id: fieldId } });
	await db.company.delete({ where: { id: companyId } });
	await db.contact.delete({ where: { id: contactId } });
	await db.revenueAccountRelationPolicy.deleteMany({
		where: { configId: "revenue-account-config" },
	});
	await db.revenueAccountConfig.update({
		where: { id: "revenue-account-config" },
		data: { enabled: false },
	});
	await db.teamMembership.deleteMany({ where: { userId } });
	await db.businessUnitMembership.deleteMany({ where: { userId } });
	await db.userAccess.delete({ where: { userId } });
	await db.user.delete({ where: { id: userId } });
});

describe("RevenueAccount vertical slice", () => {
	it("creates, validates fields, associates and preserves operation lineage", async () => {
		const account = await service.create(
			{ name: "Target Conta", customValues: { [fieldKey]: "target" } },
			principal,
		);
		targetId = account.id;
		await service.associate(
			{
				revenueAccountId: targetId,
				targetKind: "COMPANY",
				targetId: companyId,
			},
			principal,
		);
		await service.associate(
			{
				revenueAccountId: targetId,
				targetKind: "CONTACT",
				targetId: contactId,
			},
			principal,
		);
		const history = await service.history(targetId, principal);
		expect(history[0].some((event) => event.operationId)).toBe(true);
	});

	it("requires explicit conflict policy and keeps source lineage on merge", async () => {
		const source = await service.create(
			{ name: "Source Conta", customValues: { [fieldKey]: "source" } },
			principal,
		);
		sourceId = source.id;
		const preview = await service.mergePreview(
			{ sourceAccountId: sourceId, targetAccountId: targetId },
			principal,
		);
		expect(preview.conflicts).toEqual([fieldKey]);
		await service.merge(
			{
				sourceAccountId: sourceId,
				targetAccountId: targetId,
				fieldPolicies: { [fieldKey]: "SOURCE" },
				operationId: `merge-${suffix}`,
			},
			principal,
		);
		const merged = await db.revenueAccount.findUnique({
			where: { id: sourceId },
		});
		expect(merged?.mergedIntoId).toBe(targetId);
		const merge = await db.revenueAccountMerge.findFirst({
			where: { sourceAccountId: sourceId },
		});
		expect(merge?.operationId).toBe(`merge-${suffix}`);
	});
});
