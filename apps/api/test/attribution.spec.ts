import { describe, expect, it } from "bun:test";
import { pipelineEntryCount } from "../src/attribution/attribution.helpers";
import type { AttributionTouch } from "../src/attribution/attribution.types";

function touch(overrides: Partial<AttributionTouch> = {}): AttributionTouch {
	return {
		id: crypto.randomUUID(),
		origin: "ACTIVITY",
		sourceRecordId: "activity",
		entityId: "contact",
		entityType: "CONTACT",
		channel: null,
		source: null,
		conversionType: "PIPELINE_STAGE_CHANGE",
		utmSource: null,
		utmMedium: null,
		utmCampaign: null,
		utmTerm: null,
		utmContent: null,
		marketingForm: null,
		marketingEvent: null,
		pipelineId: "pipeline",
		pipelineStageId: "stage",
		dealId: "deal",
		occurredAt: "2026-01-01T00:00:00.000Z",
		operationId: null,
		actorId: null,
		...overrides,
	};
}

describe("attribution pipeline entry projection", () => {
	it("counts one legacy entry across multiple stages and two recurring deals", () => {
		expect(
			pipelineEntryCount([
				touch({ id: "stage-1", pipelineStageId: "stage-1" }),
				touch({ id: "stage-2", pipelineStageId: "stage-2" }),
				touch({ id: "deal-2", dealId: "deal-2" }),
			]),
		).toBe(2);
	});

	it("does not duplicate a legacy pair when a normalized entry exists", () => {
		expect(
			pipelineEntryCount([
				touch({ id: "stage-1", pipelineStageId: "stage-1" }),
				touch({ id: "stage-2", pipelineStageId: "stage-2" }),
				touch({
					id: "entry",
					origin: "CONVERSION_EVENT",
					conversionType: "PIPELINE_ENTRY",
				}),
			]),
		).toBe(1);
	});
});
