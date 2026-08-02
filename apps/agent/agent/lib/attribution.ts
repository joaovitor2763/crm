import { ConversionEntityType, db } from "@crm/db";
import type { AgentAccess } from "./access";
import { revenueAccountLineageIds } from "./revenue-accounts";

export type AgentAttributionEntity =
	| "CONTACT"
	| "COMPANY"
	| "DEAL"
	| "REVENUE_ACCOUNT";

export type AgentAttributionEvent = {
	id: string;
	entityType: AgentAttributionEntity;
	entityId: string;
	channel: string | null;
	source: string | null;
	conversionType: string;
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	utmTerm: string | null;
	utmContent: string | null;
	marketingFormId: string | null;
	marketingEventId: string | null;
	pipelineId: string | null;
	pipelineStageId: string | null;
	dealId: string | null;
	operationId: string;
	actorId: string | null;
	occurredAt: string;
	lineageEntityId: string;
};

export async function readAttributionLineage(
	entityType: AgentAttributionEntity,
	entityId: string,
	access: AgentAccess,
	limit = 100,
) {
	const lineageIds =
		entityType === "REVENUE_ACCOUNT"
			? await revenueAccountLineageIds(entityId, access)
			: [entityId];
	const rows = await db.conversionAttributionEvent.findMany({
		where: {
			entityType: ConversionEntityType[entityType],
			entityId: { in: lineageIds },
		},
		orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
		take: Math.min(limit, 250),
	});
	const events = rows.map(
		(row) =>
			({
				id: row.id,
				entityType: row.entityType as AgentAttributionEntity,
				entityId: row.entityId,
				channel: row.channel,
				source: row.source,
				conversionType: row.conversionType,
				utmSource: row.utmSource,
				utmMedium: row.utmMedium,
				utmCampaign: row.utmCampaign,
				utmTerm: row.utmTerm,
				utmContent: row.utmContent,
				marketingFormId: row.marketingFormId,
				marketingEventId: row.marketingEventId,
				pipelineId: row.pipelineId,
				pipelineStageId: row.pipelineStageId,
				dealId: row.dealId,
				operationId: row.operationId,
				actorId: row.actorId,
				occurredAt: row.occurredAt.toISOString(),
				lineageEntityId: row.entityId,
			}) satisfies AgentAttributionEvent,
	);
	const firstTouch = events[0] ?? null;
	const currentTouch = events.at(-1) ?? null;
	const conversions = events.filter(
		(event) => event.conversionType !== "TOUCH",
	);
	return {
		entityType,
		entityId,
		lineageEntityIds: lineageIds,
		firstTouch,
		currentTouch,
		firstConversion: conversions[0] ?? null,
		conversionCount: conversions.length,
		touchCount: events.length - conversions.length,
		pipelineEntryCount: events.filter(
			(event) =>
				event.conversionType === "PIPELINE_ENTRY" ||
				event.conversionType === "PIPELINE_STAGE_CHANGE",
		).length,
		sourceHistory: unique(events.map((event) => event.source)),
		channelHistory: unique(events.map((event) => event.channel)),
		events,
	};
}

function unique(values: Array<string | null>) {
	return [
		...new Set(values.filter((value): value is string => value !== null)),
	];
}
