import type { Prisma } from "@crm/db";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { asJsonMap, changedKeys } from "./revenue-accounts.helpers";

export function writeAccountHistory(
	tx: Prisma.TransactionClient,
	id: string,
	operationId: string,
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	principal: EffectivePrincipal,
	source: string,
) {
	const rows = changedKeys(asJsonMap(before), asJsonMap(after));
	if (rows.length === 0) return Promise.resolve();
	return tx.revenueAccountAttributeHistory.createMany({
		data: rows.map((fieldKey) => ({
			revenueAccountId: id,
			operationId,
			fieldKey,
			previousValue: before[fieldKey] as Prisma.InputJsonValue,
			nextValue: after[fieldKey] as Prisma.InputJsonValue,
			changedByType: principal.actorType,
			changedById: principal.actorId,
			source,
		})),
	});
}

export function writeAccountLineage(
	tx: Prisma.TransactionClient,
	id: string,
	operationId: string,
	type:
		| "CREATED"
		| "UPDATED"
		| "ARCHIVED"
		| "RELATION_ATTACHED"
		| "RELATION_DETACHED"
		| "MERGED_IN"
		| "MERGED_OUT",
	principal: EffectivePrincipal,
	payload: Record<string, unknown>,
) {
	return tx.revenueAccountLineageEvent.create({
		data: {
			revenueAccountId: id,
			operationId,
			type,
			actorType: principal.actorType,
			actorId: principal.actorId,
			payload: payload as Prisma.InputJsonValue,
		},
	});
}

export function writeAccountDomainEvent(
	tx: Prisma.TransactionClient,
	type: string,
	recordId: string,
	operationId: string,
	principal: EffectivePrincipal,
	payload: Record<string, Prisma.InputJsonValue>,
	businessUnitId?: string | null,
	teamId?: string | null,
) {
	return tx.domainEvent.create({
		data: {
			eventKey: `${type}:${recordId}:${operationId}`,
			type,
			resource: "revenue-accounts",
			recordId,
			businessUnitId: businessUnitId ?? null,
			teamId: teamId ?? null,
			actorType: principal.actorType,
			actorId: principal.actorId,
			payload: { operationId, ...payload },
		},
	});
}
