import { z } from "zod";

export const leadIngestionInput = z
	.object({
		source: z.string().trim().min(1).max(120),
		externalId: z.string().trim().max(240).optional(),
		idempotencyKey: z.string().trim().max(240).optional(),
		businessUnitId: z.string(),
		teamId: z.string().nullable().optional(),
		ownerId: z.string().nullable().optional(),
		firstName: z.string().trim().min(1).max(120),
		lastName: z.string().trim().max(120).optional(),
		email: z.email().optional(),
		phone: z.string().trim().max(80).optional(),
		title: z.string().trim().max(160).optional(),
		companyId: z.string().nullable().optional(),
		utmSource: z.string().trim().max(240).optional(),
		utmMedium: z.string().trim().max(240).optional(),
		utmCampaign: z.string().trim().max(240).optional(),
		utmTerm: z.string().trim().max(240).optional(),
		utmContent: z.string().trim().max(240).optional(),
		customValues: z.record(z.string(), z.unknown()).default({}),
	})
	.refine((input) => input.email || input.phone, {
		message: "A lead needs an email address or phone number.",
		path: ["email"],
	});

export type LeadIngestionInput = z.infer<typeof leadIngestionInput>;
