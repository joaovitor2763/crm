import type { Prisma } from "@crm/db";
import type { AttributionTouch } from "./attribution.types";

export const conversionEventSelect = {
	id: true,
	entityType: true,
	entityId: true,
	channel: true,
	source: true,
	conversionType: true,
	utmSource: true,
	utmMedium: true,
	utmCampaign: true,
	utmTerm: true,
	utmContent: true,
	marketingForm: { select: { id: true, name: true } },
	marketingEvent: { select: { id: true, name: true } },
	pipelineId: true,
	pipelineStageId: true,
	dealId: true,
	businessUnitId: true,
	teamId: true,
	occurredAt: true,
	operationId: true,
	actorId: true,
} as const;

export const activityAttributionSelect = {
	id: true,
	type: true,
	occurredAt: true,
	createdAt: true,
	createdById: true,
	dealId: true,
	meta: true,
	marketingForm: { select: { id: true, name: true } },
	marketingEvent: { select: { id: true, name: true } },
	deal: { select: { pipelineId: true, stageId: true } },
} as const;

export const leadSubmissionAttributionSelect = {
	id: true,
	source: true,
	receivedAt: true,
	normalizedPayload: true,
} as const;

type ConversionEventRow = Prisma.ConversionAttributionEventGetPayload<{
	select: typeof conversionEventSelect;
}>;
type ActivityRow = Prisma.ActivityGetPayload<{
	select: typeof activityAttributionSelect;
}>;
type LeadSubmissionRow = Prisma.LeadSubmissionGetPayload<{
	select: typeof leadSubmissionAttributionSelect;
}>;

export function conversionEventTouch(
	row: ConversionEventRow,
): AttributionTouch {
	return {
		id: row.id,
		origin: "CONVERSION_EVENT",
		sourceRecordId: row.id,
		entityId: row.entityId,
		entityType: row.entityType,
		channel: row.channel,
		source: row.source,
		conversionType: row.conversionType,
		utmSource: row.utmSource,
		utmMedium: row.utmMedium,
		utmCampaign: row.utmCampaign,
		utmTerm: row.utmTerm,
		utmContent: row.utmContent,
		marketingForm: row.marketingForm,
		marketingEvent: row.marketingEvent,
		pipelineId: row.pipelineId,
		pipelineStageId: row.pipelineStageId,
		dealId: row.dealId,
		occurredAt: row.occurredAt.toISOString(),
		operationId: row.operationId,
		actorId: row.actorId,
	};
}

export function activityTouch(
	row: ActivityRow,
	entityType: AttributionTouch["entityType"],
	entityId: string,
): AttributionTouch {
	const meta = asRecord(row.meta);
	const isStageChange = row.type === "STAGE_CHANGE";
	return {
		id: row.id,
		origin: "ACTIVITY",
		sourceRecordId: row.id,
		entityId,
		entityType,
		channel: stringValue(meta.channel),
		source:
			row.marketingForm?.name ??
			row.marketingEvent?.name ??
			(isStageChange ? "pipeline" : null),
		conversionType: isStageChange ? "PIPELINE_STAGE_CHANGE" : row.type,
		utmSource: stringValue(meta.utmSource),
		utmMedium: stringValue(meta.utmMedium),
		utmCampaign: stringValue(meta.utmCampaign),
		utmTerm: stringValue(meta.utmTerm),
		utmContent: stringValue(meta.utmContent),
		marketingForm: row.marketingForm,
		marketingEvent: row.marketingEvent,
		pipelineId: row.deal?.pipelineId ?? null,
		pipelineStageId: stringValue(meta.toId) ?? row.deal?.stageId ?? null,
		dealId: row.dealId,
		occurredAt: (row.occurredAt ?? row.createdAt).toISOString(),
		operationId: null,
		actorId: row.createdById,
	};
}

export function leadSubmissionTouch(
	row: LeadSubmissionRow,
	entityId: string,
): AttributionTouch {
	const payload = asRecord(row.normalizedPayload);
	return {
		id: row.id,
		origin: "LEAD_SUBMISSION",
		sourceRecordId: row.id,
		entityId,
		entityType: "CONTACT",
		channel: row.source,
		source: row.source,
		conversionType: "LEAD_SUBMISSION",
		utmSource: stringValue(payload.utmSource),
		utmMedium: stringValue(payload.utmMedium),
		utmCampaign: stringValue(payload.utmCampaign),
		utmTerm: stringValue(payload.utmTerm),
		utmContent: stringValue(payload.utmContent),
		marketingForm: null,
		marketingEvent: null,
		pipelineId: null,
		pipelineStageId: null,
		dealId: null,
		occurredAt: row.receivedAt.toISOString(),
		operationId: null,
		actorId: null,
	};
}

export function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value : null;
}

export function isPipelineEntry(touch: AttributionTouch): boolean {
	return (
		touch.origin === "CONVERSION_EVENT" &&
		touch.conversionType === "PIPELINE_ENTRY"
	);
}

export function pipelineEntryCount(touches: AttributionTouch[]): number {
	const explicitEntries = touches.filter(isPipelineEntry);
	const explicitPairs = new Set(
		explicitEntries
			.filter(
				(
					touch,
				): touch is AttributionTouch & {
					dealId: string;
					pipelineId: string;
				} => Boolean(touch.dealId && touch.pipelineId),
			)
			.map((touch) => `${touch.dealId}\u0000${touch.pipelineId}`),
	);
	const legacyPairs = new Set(
		touches
			.filter(
				(touch) =>
					touch.origin !== "CONVERSION_EVENT" &&
					touch.dealId !== null &&
					touch.pipelineId !== null,
			)
			.map((touch) => `${touch.dealId}\u0000${touch.pipelineId}`)
			.filter((pair) => !explicitPairs.has(pair)),
	);
	return explicitEntries.length + legacyPairs.size;
}
