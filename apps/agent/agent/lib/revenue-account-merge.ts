import { db, type Prisma } from "@crm/db";
import type { AgentAccess } from "./access";
import {
	asMap,
	findAccount,
	projectValues,
	sameValue,
} from "./revenue-accounts";

export async function executeRevenueAccountMerge(
	sourceId: string,
	targetId: string,
	fieldPolicies: Record<string, "TARGET" | "SOURCE" | "UNION" | "SKIP">,
	access: AgentAccess,
	operationId: string = crypto.randomUUID(),
) {
	if (sourceId === targetId)
		throw new Error("A RevenueAccount cannot merge into itself.");
	const [source, target] = await Promise.all([
		findAccount(sourceId, access),
		findAccount(targetId, access),
	]);
	if (!source || !target)
		throw new Error("RevenueAccount not found or outside your CRM scope.");
	const [sourceValues, targetValues] = await Promise.all([
		projectValues(source.customValues, access, true),
		projectValues(target.customValues, access, true),
	]);
	const conflicts = Object.keys(sourceValues).filter(
		(key) =>
			key in targetValues && !sameValue(sourceValues[key], targetValues[key]),
	);
	const unresolved = conflicts.filter((key) => !fieldPolicies[key]);
	if (unresolved.length > 0) {
		throw new Error(`Choose a merge policy for: ${unresolved.join(", ")}.`);
	}
	const mergedValues = mergeValues(targetValues, sourceValues, fieldPolicies);
	await db.$transaction(async (tx) => {
		const currentTarget = await tx.revenueAccount.findFirst({
			where: {
				AND: [{ id: targetId, archivedAt: null }, access.revenueAccountWhere],
			},
			select: { customValues: true },
		});
		if (!currentTarget)
			throw new Error("The target RevenueAccount changed before approval.");
		const targetRaw = asMap(currentTarget.customValues);
		const visibleKeys = new Set(
			Object.keys(sourceValues).concat(Object.keys(targetValues)),
		);
		for (const [key, value] of Object.entries(mergedValues)) {
			if (visibleKeys.has(key)) targetRaw[key] = value as Prisma.InputJsonValue;
		}
		await tx.revenueAccount.update({
			where: { id: targetId },
			data: { customValues: targetRaw as Prisma.InputJsonValue },
		});
		await transferRelations(tx, sourceId, targetId, access);
		await tx.revenueAccount.update({
			where: { id: sourceId },
			data: {
				archivedAt: new Date(),
				mergedAt: new Date(),
				mergedIntoId: targetId,
			},
		});
		await tx.revenueAccountMerge.create({
			data: {
				sourceAccountId: sourceId,
				targetAccountId: targetId,
				operationId,
				policy: fieldPolicies as Prisma.InputJsonValue,
				executedByType: "AGENT",
				executedById: access.userId,
			},
		});
		for (const fieldKey of Object.keys(mergedValues)) {
			if (!sameValue(targetValues[fieldKey], mergedValues[fieldKey])) {
				await tx.revenueAccountAttributeHistory.create({
					data: {
						revenueAccountId: targetId,
						operationId,
						fieldKey,
						previousValue: (targetValues[fieldKey] ??
							null) as Prisma.InputJsonValue,
						nextValue: mergedValues[fieldKey] as Prisma.InputJsonValue,
						changedByType: "AGENT",
						changedById: access.userId,
						source: "agent-revenue-account-merge",
					},
				});
			}
		}
		await tx.revenueAccountLineageEvent.createMany({
			data: [
				{
					revenueAccountId: targetId,
					operationId,
					type: "MERGED_IN",
					actorType: "AGENT",
					actorId: access.userId,
					sourceType: "revenue-account",
					sourceId: sourceId,
					payload: { fieldPolicies },
				},
				{
					revenueAccountId: sourceId,
					operationId,
					type: "MERGED_OUT",
					actorType: "AGENT",
					actorId: access.userId,
					sourceType: "revenue-account",
					sourceId: targetId,
					payload: {},
				},
			],
		});
	});
	return {
		merged: true as const,
		sourceAccountId: sourceId,
		targetAccountId: targetId,
		operationId,
	};
}

export function mergeValues(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
	policies: Record<string, "TARGET" | "SOURCE" | "UNION" | "SKIP">,
) {
	const result = { ...target };
	for (const [key, sourceValue] of Object.entries(source)) {
		const targetValue = result[key];
		if (targetValue === undefined) {
			result[key] = sourceValue;
			continue;
		}
		if (sameValue(targetValue, sourceValue)) continue;
		const policy = policies[key];
		if (policy === "SOURCE") result[key] = sourceValue;
		if (policy === "UNION") result[key] = unionValues(targetValue, sourceValue);
		if (policy === "SKIP" || policy === "TARGET") result[key] = targetValue;
	}
	return result;
}

function unionValues(target: unknown, source: unknown) {
	if (!Array.isArray(target) || !Array.isArray(source)) return source;
	return [
		...new Map(
			[...target, ...source].map((value) => [JSON.stringify(value), value]),
		).values(),
	];
}

async function transferRelations(
	tx: Prisma.TransactionClient,
	sourceId: string,
	targetId: string,
	access: AgentAccess,
) {
	const contacts = await tx.revenueAccountContact.findMany({
		where: {
			AND: [
				{ revenueAccountId: sourceId, archivedAt: null },
				{ contact: { is: access.contactWhere } },
			],
		},
		select: { contactId: true },
	});
	for (const row of contacts) {
		await tx.revenueAccountContact.upsert({
			where: {
				revenueAccountId_contactId: {
					revenueAccountId: targetId,
					contactId: row.contactId,
				},
			},
			create: {
				revenueAccountId: targetId,
				contactId: row.contactId,
				attachedByType: "AGENT",
				archivedAt: null,
			},
			update: { archivedAt: null },
		});
	}
	const companies = await tx.revenueAccountCompany.findMany({
		where: {
			AND: [
				{ revenueAccountId: sourceId, archivedAt: null },
				{ company: { is: access.companyWhere } },
			],
		},
		select: { companyId: true },
	});
	for (const row of companies) {
		await tx.revenueAccountCompany.upsert({
			where: {
				revenueAccountId_companyId: {
					revenueAccountId: targetId,
					companyId: row.companyId,
				},
			},
			create: {
				revenueAccountId: targetId,
				companyId: row.companyId,
				attachedByType: "AGENT",
				archivedAt: null,
			},
			update: { archivedAt: null },
		});
	}
	const deals = await tx.revenueAccountDeal.findMany({
		where: {
			AND: [
				{ revenueAccountId: sourceId, archivedAt: null },
				{ deal: { is: access.dealWhere } },
			],
		},
		select: { dealId: true },
	});
	for (const row of deals) {
		await tx.revenueAccountDeal.upsert({
			where: {
				revenueAccountId_dealId: {
					revenueAccountId: targetId,
					dealId: row.dealId,
				},
			},
			create: {
				revenueAccountId: targetId,
				dealId: row.dealId,
				attachedByType: "AGENT",
				archivedAt: null,
			},
			update: { archivedAt: null },
		});
	}
}
