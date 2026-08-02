export type AttributionOrigin =
	| "CONVERSION_EVENT"
	| "ACTIVITY"
	| "LEAD_SUBMISSION";

export type AttributionTouch = {
	id: string;
	origin: AttributionOrigin;
	sourceRecordId: string;
	entityType: "CONTACT" | "COMPANY" | "DEAL" | "REVENUE_ACCOUNT";
	channel: string | null;
	source: string | null;
	conversionType: string;
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	utmTerm: string | null;
	utmContent: string | null;
	marketingForm: { id: string; name: string } | null;
	marketingEvent: { id: string; name: string } | null;
	pipelineId: string | null;
	pipelineStageId: string | null;
	dealId: string | null;
	occurredAt: string;
	operationId: string | null;
	actorId: string | null;
};

export type AttributionProjection = {
	entityType: AttributionTouch["entityType"];
	entityId: string;
	firstTouch: AttributionTouch | null;
	currentTouch: AttributionTouch | null;
	firstConversion: AttributionTouch | null;
	conversionCount: number;
	touchCount: number;
	pipelineEntryCount: number;
	sourceHistory: string[];
	channelHistory: string[];
	events: AttributionTouch[];
};
