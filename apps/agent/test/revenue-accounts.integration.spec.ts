import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { CustomFieldType, db } from "@crm/db";
import type { AgentAccess } from "../agent/lib/access";
import { readAttributionLineage } from "../agent/lib/attribution";
import { executeRevenueAccountMerge } from "../agent/lib/revenue-account-merge";
import {
	previewRevenueAccountMerge,
	readRevenueAccount,
	suggestRevenueAccountDuplicates,
} from "../agent/lib/revenue-accounts";

const suffix = process.env.TEST_RUN_ID ?? `revenue-agent-${Date.now()}`;
const businessUnitId = `revenue-agent-unit-${suffix}`;
const sourceName = `Source Conta ${suffix}`;
const targetName = `Target Conta ${suffix}`;
const sourceOperationId = `operation-source-${suffix}`;
const fieldKey = `agent_visible_${suffix.replace(/[^a-z0-9]/gi, "_")}`;

let sourceId = "";
let targetId = "";
let objectDefinitionId = "";

const access: AgentAccess = {
	isSystem: false,
	isAdmin: false,
	userId: `agent-user-${suffix}`,
	contactWhere: {},
	companyWhere: {},
	dealWhere: {},
	revenueAccountWhere: { businessUnitId },
	activityWhere: {},
	fieldPermissions: [],
};

beforeAll(async () => {
	await db.businessUnit.create({
		data: {
			id: businessUnitId,
			key: businessUnitId,
			name: `Revenue Agent ${suffix}`,
		},
	});
	const definition = await db.objectDefinition.findUnique({
		where: { key: "revenue-accounts" },
		select: { id: true },
	});
	if (definition) {
		objectDefinitionId = definition.id;
	} else {
		const created = await db.objectDefinition.create({
			data: {
				key: "revenue-accounts",
				name: "Conta",
				pluralName: "Contas",
			},
			select: { id: true },
		});
		objectDefinitionId = created.id;
	}
	await db.customFieldDefinition.create({
		data: {
			objectDefinitionId,
			key: fieldKey,
			label: "Agent visible field",
			type: CustomFieldType.TEXT,
			agentReadable: true,
			agentWritable: true,
		},
	});
	const [source, target] = await Promise.all([
		db.revenueAccount.create({
			data: {
				name: sourceName,
				domain: `same-${suffix}.test`,
				businessUnitId,
				customValues: { [fieldKey]: "from source", hidden: "do not leak" },
			},
			select: { id: true },
		}),
		db.revenueAccount.create({
			data: {
				name: targetName,
				domain: `same-${suffix}.test`,
				businessUnitId,
				customValues: { [fieldKey]: "from target", hidden: "target secret" },
			},
			select: { id: true },
		}),
	]);
	sourceId = source.id;
	targetId = target.id;
	await db.revenueAccountLineageEvent.create({
		data: {
			revenueAccountId: sourceId,
			operationId: sourceOperationId,
			type: "CREATED",
			actorType: "SYSTEM",
			payload: { source: "integration-test" },
		},
	});
	await db.revenueAccountAttributeHistory.create({
		data: {
			revenueAccountId: sourceId,
			operationId: sourceOperationId,
			fieldKey: "hidden",
			previousValue: "private before",
			nextValue: "private after",
			changedByType: "SYSTEM",
		},
	});
});

afterAll(async () => {
	await db.revenueAccountLineageEvent.deleteMany({
		where: { revenueAccountId: { in: [sourceId, targetId] } },
	});
	await db.revenueAccount.deleteMany({
		where: { id: { in: [sourceId, targetId] } },
	});
	await db.customFieldDefinition.deleteMany({ where: { key: fieldKey } });
	if (objectDefinitionId) {
		const remaining = await db.customFieldDefinition.count({
			where: { objectDefinitionId },
		});
		if (remaining === 0)
			await db.objectDefinition.delete({ where: { id: objectDefinitionId } });
	}
	await db.businessUnit.delete({ where: { id: businessUnitId } });
});

describe("RevenueAccount agent reads", () => {
	it("projects custom values and keeps lineage operation ids", async () => {
		const result = await readRevenueAccount(sourceId, access);

		expect(result?.id).toBe(sourceId);
		expect(result?.customValues).toEqual({ [fieldKey]: "from source" });
		expect(result?.customValues).not.toHaveProperty("hidden");
		expect(result?.attributeHistory).toEqual([]);
		expect(result?.lineage[0]?.operationId).toBe(sourceOperationId);
	});

	it("suggests same-domain duplicates with derived evidence", async () => {
		const result = await suggestRevenueAccountDuplicates(sourceId, access);
		const candidate = result?.candidates.find(
			(item) => item.account.id === targetId,
		);

		expect(
			candidate?.evidence.some((item) => item.signal === "exact-domain"),
		).toBe(true);
		expect(candidate?.confidence).toBeGreaterThanOrEqual(0.75);
	});

	it("previews visible field conflicts without mutating either account", async () => {
		const preview = await previewRevenueAccountMerge(
			sourceId,
			targetId,
			access,
		);

		expect(preview?.requiresApproval).toBe(true);
		expect(preview?.conflicts).toEqual([
			{
				fieldKey: "system.name",
				sourceValue: sourceName,
				targetValue: targetName,
			},
			{
				fieldKey,
				sourceValue: "from source",
				targetValue: "from target",
			},
		]);
		expect(
			await db.revenueAccount.findUnique({
				where: { id: sourceId },
				select: { archivedAt: true },
			}),
		).toEqual({ archivedAt: null });
	});

	it("executes only an explicit policy and records one operation lineage", async () => {
		const operationId = `operation-merge-${suffix}`;
		const [source, target] = await Promise.all([
			db.revenueAccount.create({
				data: {
					name: `Merge source ${suffix}`,
					domain: `merge-${suffix}.test`,
					businessUnitId,
					customValues: { [fieldKey]: "source value" },
				},
				select: { id: true },
			}),
			db.revenueAccount.create({
				data: {
					name: `Merge target ${suffix}`,
					domain: `target-${suffix}.test`,
					businessUnitId,
					customValues: {
						[fieldKey]: "target value",
						hidden_target_field: "keep this value",
					},
				},
				select: { id: true },
			}),
		]);
		let attributionId = "";
		try {
			const attribution = await db.conversionAttributionEvent.create({
				data: {
					entityType: "REVENUE_ACCOUNT",
					entityId: source.id,
					revenueAccountId: source.id,
					businessUnitId,
					actorType: "SYSTEM",
					conversionType: "PIPELINE_ENTRY",
					operationId: `attribution-${suffix}`,
				},
			});
			attributionId = attribution.id;
			const result = await executeRevenueAccountMerge(
				source.id,
				target.id,
				{
					[fieldKey]: "SOURCE",
					"system.name": "TARGET",
					"system.domain": "SOURCE",
				},
				access,
				operationId,
			);

			expect(result).toMatchObject({
				merged: true,
				sourceAccountId: source.id,
				targetAccountId: target.id,
				operationId,
			});
			expect(
				await db.revenueAccount.findUnique({
					where: { id: target.id },
					select: { customValues: true },
				}),
			).toEqual({
				customValues: {
					[fieldKey]: "source value",
					hidden_target_field: "keep this value",
				},
			});
			const targetValues = await db.revenueAccount.findUnique({
				where: { id: target.id },
				select: { customValues: true, name: true, domain: true },
			});
			expect(targetValues).toEqual({
				customValues: {
					[fieldKey]: "source value",
					hidden_target_field: "keep this value",
				},
				name: `Merge target ${suffix}`,
				domain: `merge-${suffix}.test`,
			});
			expect(
				await db.revenueAccount.findUnique({
					where: { id: source.id },
					select: { archivedAt: true, mergedIntoId: true },
				}),
			).toMatchObject({ mergedIntoId: target.id });
			expect(
				await db.revenueAccountLineageEvent.count({ where: { operationId } }),
			).toBe(2);
			expect(
				await db.domainEvent.count({
					where: {
						eventKey: `revenue-account.merged:${target.id}:${operationId}`,
					},
				}),
			).toBe(1);
			const lineage = await readAttributionLineage(
				"REVENUE_ACCOUNT",
				target.id,
				access,
			);
			expect(lineage.lineageEntityIds).toContain(source.id);
			expect(lineage.events).toHaveLength(1);
			expect(lineage.events[0]?.entityId).toBe(source.id);
		} finally {
			await db.conversionAttributionEvent.deleteMany({
				where: { id: attributionId },
			});
			await db.domainEvent.deleteMany({
				where: {
					eventKey: `revenue-account.merged:${target.id}:${operationId}`,
				},
			});
			await db.revenueAccountAttributeHistory.deleteMany({
				where: { operationId },
			});
			await db.revenueAccountLineageEvent.deleteMany({
				where: { operationId },
			});
			await db.revenueAccountMerge.deleteMany({ where: { operationId } });
			await db.revenueAccount.deleteMany({
				where: { id: { in: [source.id, target.id] } },
			});
		}
	});
});
