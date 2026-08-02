import { z } from "zod";

export const conversionEntityType = z.enum([
	"CONTACT",
	"COMPANY",
	"DEAL",
	"REVENUE_ACCOUNT",
]);

const optionalText = (max: number) => z.string().trim().max(max).optional();
const dateInput = z
	.string()
	.trim()
	.refine((value) => !Number.isNaN(Date.parse(value)), "Use an ISO date.");

export const attributionEventInput = z
	.object({
		entityType: conversionEntityType,
		entityId: z.string().trim().min(1).max(120),
		channel: optionalText(120),
		source: optionalText(240),
		conversionType: z.string().trim().min(1).max(120),
		utmSource: optionalText(240),
		utmMedium: optionalText(240),
		utmCampaign: optionalText(240),
		utmTerm: optionalText(240),
		utmContent: optionalText(240),
		marketingFormId: optionalText(120),
		marketingEventId: optionalText(120),
		pipelineId: optionalText(120),
		pipelineStageId: optionalText(120),
		dealId: optionalText(120),
		occurredAt: dateInput.optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
		operationId: z.string().trim().min(1).max(160).optional(),
	})
	.superRefine((input, context) => {
		if (input.pipelineStageId && !input.pipelineId) {
			context.addIssue({
				code: "custom",
				path: ["pipelineId"],
				message: "pipelineId is required when pipelineStageId is provided.",
			});
		}
		if (
			input.entityType === "DEAL" &&
			input.dealId &&
			input.dealId !== input.entityId
		) {
			context.addIssue({
				code: "custom",
				path: ["dealId"],
				message: "A DEAL event must use its entityId as dealId.",
			});
		}
	});

/** Credential-authenticated integrations must supply their retry key. */
export const externalAttributionEventInput = attributionEventInput.and(
	z.object({ operationId: z.string().trim().min(1).max(160) }),
);

export const attributionProjectionInput = z.object({
	entityType: conversionEntityType,
	entityId: z.string().trim().min(1).max(120),
	includeEvents: z.boolean().default(true),
	limit: z.number().int().min(1).max(500).default(200),
});

export const attributionHistoryInput = attributionProjectionInput;

export type AttributionEventInput = z.infer<typeof attributionEventInput>;
export type AttributionProjectionInput = z.infer<
	typeof attributionProjectionInput
>;
