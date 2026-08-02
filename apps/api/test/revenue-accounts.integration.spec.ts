import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AccessControlService } from "../src/access-control/access-control.service";
import { AttributionService } from "../src/attribution/attribution.service";
import { FieldsService } from "../src/fields/fields.service";
import { RevenueAccountsService } from "../src/revenue-accounts/revenue-accounts.service";

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `revenue-account-test-${suffix}`;
const companyId = `revenue-company-test-${suffix}`;
const contactId = `revenue-contact-test-${suffix}`;
const fieldKey = `segment_${suffix}`;
const hiddenTargetFieldKey = `hidden_target_${suffix}`;
const hiddenSourceFieldKey = `hidden_source_${suffix}`;

let service: RevenueAccountsService;
let principal: Awaited<ReturnType<AccessControlService["forUser"]>>;
let fieldId: string;
let hiddenTargetFieldId: string;
let hiddenSourceFieldId: string;
let sourceId: string;
let targetId: string;
let chainSourceId: string;
let chainMiddleId: string;
let chainTargetId: string;
let attribution: AttributionService;

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
	attribution = new AttributionService(db, access, service);
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
	hiddenTargetFieldId = `revenue-hidden-target-${suffix}`;
	hiddenSourceFieldId = `revenue-hidden-source-${suffix}`;
	await db.customFieldDefinition.createMany({
		data: [
			{
				id: hiddenTargetFieldId,
				objectDefinitionId: "object-revenue-account",
				key: hiddenTargetFieldKey,
				label: "Hidden target field",
				type: "TEXT",
				apiReadable: false,
				apiWritable: false,
			},
			{
				id: hiddenSourceFieldId,
				objectDefinitionId: "object-revenue-account",
				key: hiddenSourceFieldKey,
				label: "Hidden source field",
				type: "TEXT",
				apiReadable: false,
				apiWritable: false,
			},
		],
	});
	await db.company.create({
		data: { id: companyId, name: "Revenue Test Company" },
	});
	await db.contact.create({
		data: { id: contactId, firstName: "Revenue", lastName: "Contact" },
	});
});

afterAll(async () => {
	const accountIds = [
		sourceId,
		targetId,
		chainSourceId,
		chainMiddleId,
		chainTargetId,
	].filter((id): id is string => Boolean(id));
	await db.domainEvent.deleteMany({
		where: {
			actorId: userId,
			OR: [
				{ resource: "revenue-accounts" },
				{ resource: "conversion-attribution" },
			],
		},
	});
	await db.conversionAttributionEvent.deleteMany({
		where: { entityId: { in: accountIds } },
	});
	await db.revenueAccountMerge.deleteMany({
		where: {
			OR: [
				{ sourceAccountId: { in: accountIds } },
				{ targetAccountId: { in: accountIds } },
			],
		},
	});
	await db.revenueAccountLineageEvent.deleteMany({
		where: { revenueAccountId: { in: accountIds } },
	});
	await db.revenueAccountAttributeHistory.deleteMany({
		where: { revenueAccountId: { in: accountIds } },
	});
	await db.revenueAccountContact.deleteMany({
		where: { revenueAccountId: { in: accountIds } },
	});
	await db.revenueAccountCompany.deleteMany({
		where: { revenueAccountId: { in: accountIds } },
	});
	await db.revenueAccountDeal.deleteMany({
		where: { revenueAccountId: { in: accountIds } },
	});
	await db.revenueAccount.deleteMany({
		where: { id: { in: accountIds } },
	});
	await db.customFieldDefinition.delete({ where: { id: fieldId } });
	await db.customFieldDefinition.deleteMany({
		where: { id: { in: [hiddenTargetFieldId, hiddenSourceFieldId] } },
	});
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
		await db.revenueAccount.update({
			where: { id: targetId },
			data: {
				customValues: {
					[fieldKey]: "target",
					[hiddenTargetFieldKey]: "target-only",
				},
			},
		});
		await db.revenueAccount.update({
			where: { id: sourceId },
			data: {
				customValues: {
					[fieldKey]: "source",
					[hiddenSourceFieldKey]: "source-only",
				},
			},
		});
		const preview = await service.mergePreview(
			{ sourceAccountId: sourceId, targetAccountId: targetId },
			principal,
		);
		expect(preview.conflicts).toEqual(
			expect.arrayContaining([fieldKey, "system.name"]),
		);
		expect(preview.fieldGuide).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					fieldKey,
					valueKind: "SCALAR",
					requiresPolicy: true,
				}),
			]),
		);
		expect(preview.source.customValues).not.toHaveProperty(
			hiddenSourceFieldKey,
		);
		expect(preview.target.customValues).not.toHaveProperty(
			hiddenTargetFieldKey,
		);
		expect(preview.fieldGuide.map((field) => field.fieldKey)).not.toEqual(
			expect.arrayContaining([hiddenTargetFieldKey, hiddenSourceFieldKey]),
		);
		const sourceEvent = await attribution.record(
			{
				entityType: "REVENUE_ACCOUNT",
				entityId: sourceId,
				conversionType: "PIPELINE_ENTRY",
				operationId: `account-lineage-${suffix}`,
			},
			principal,
		);
		const mergeInput = {
			sourceAccountId: sourceId,
			targetAccountId: targetId,
			fieldPolicies: {
				[fieldKey]: "SOURCE" as const,
				"system.name": "TARGET" as const,
			},
			operationId: `merge-${suffix}`,
		};
		await service.merge(mergeInput, principal);
		const merged = await db.revenueAccount.findUnique({
			where: { id: sourceId },
		});
		expect(merged?.mergedIntoId).toBe(targetId);
		const mergedTarget = await db.revenueAccount.findUnique({
			where: { id: targetId },
			select: { customValues: true },
		});
		expect(mergedTarget?.customValues).toEqual(
			expect.objectContaining({ [hiddenTargetFieldKey]: "target-only" }),
		);
		expect(mergedTarget?.customValues).not.toHaveProperty(hiddenSourceFieldKey);
		const retry = await service.merge(mergeInput, principal);
		expect(retry.id).toBe(targetId);
		expect(
			await db.revenueAccountMerge.count({
				where: { operationId: mergeInput.operationId },
			}),
		).toBe(1);
		await expect(
			service.merge(
				{
					...mergeInput,
					sourceAccountId: targetId,
					targetAccountId: sourceId,
				},
				principal,
			),
		).rejects.toThrow("another Conta merge");
		const projection = await attribution.history(
			{
				entityType: "REVENUE_ACCOUNT",
				entityId: targetId,
				includeEvents: true,
				limit: 100,
			},
			principal,
		);
		expect(
			projection.events.find((event) => event.id === sourceEvent.id),
		).toEqual(expect.objectContaining({ entityId: sourceId }));
		const merge = await db.revenueAccountMerge.findFirst({
			where: { sourceAccountId: sourceId },
		});
		expect(merge?.operationId).toBe(`merge-${suffix}`);
		const resolved = await service.byId(sourceId, principal);
		expect(resolved.id).toBe(targetId);
		expect(resolved.resolvedFromId).toBe(sourceId);
		const events = await db.domainEvent.findMany({
			where: { resource: "revenue-accounts", actorId: userId },
			select: { type: true, payload: true },
		});
		expect(events.map((event) => event.type)).toEqual(
			expect.arrayContaining([
				"revenue-account.created",
				"revenue-account.merged",
			]),
		);
		expect(
			events.some(
				(event) =>
					event.type === "revenue-account.merged" &&
					JSON.stringify(event.payload).includes(`merge-${suffix}`),
			),
		).toBe(true);
	});

	it("resolves attribution through chained Conta merges", async () => {
		const source = await service.create(
			{ name: "Chain source", customValues: {} },
			principal,
		);
		const middle = await service.create(
			{ name: "Chain middle", customValues: {} },
			principal,
		);
		const target = await service.create(
			{ name: "Chain target", customValues: {} },
			principal,
		);
		chainSourceId = source.id;
		chainMiddleId = middle.id;
		chainTargetId = target.id;
		const event = await attribution.record(
			{
				entityType: "REVENUE_ACCOUNT",
				entityId: chainSourceId,
				conversionType: "PIPELINE_ENTRY",
				operationId: `chain-event-${suffix}`,
			},
			principal,
		);
		await service.merge(
			{
				sourceAccountId: chainSourceId,
				targetAccountId: chainMiddleId,
				fieldPolicies: { "system.name": "TARGET" },
				operationId: `chain-first-${suffix}`,
			},
			principal,
		);
		await service.merge(
			{
				sourceAccountId: chainMiddleId,
				targetAccountId: chainTargetId,
				fieldPolicies: { "system.name": "TARGET" },
				operationId: `chain-second-${suffix}`,
			},
			principal,
		);
		const readable = await service.assertReadable(chainSourceId, principal);
		expect(readable.id).toBe(chainTargetId);
		expect(readable.lineageIds).toEqual(
			expect.arrayContaining([chainSourceId, chainMiddleId, chainTargetId]),
		);
		const projection = await attribution.history(
			{
				entityType: "REVENUE_ACCOUNT",
				entityId: chainTargetId,
				includeEvents: true,
				limit: 100,
			},
			principal,
		);
		expect(projection.events.find((touch) => touch.id === event.id)).toEqual(
			expect.objectContaining({ entityId: chainSourceId }),
		);
	});
});
