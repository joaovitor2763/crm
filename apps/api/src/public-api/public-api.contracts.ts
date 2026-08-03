import { z } from "zod";

const clearableUrl = z.union([z.url(), z.literal("")]);

export const publicContactUpdateInput = z
	.object({
		firstName: z.string().trim().min(1).max(120).optional(),
		lastName: z.string().trim().max(120).optional(),
		email: z.union([z.email(), z.literal("")]).optional(),
		phone: z.string().trim().max(80).optional(),
		title: z.string().trim().max(160).optional(),
		linkedinUrl: clearableUrl.optional(),
		twitterUrl: clearableUrl.optional(),
		githubUrl: clearableUrl.optional(),
		utmSource: z.string().trim().max(240).optional(),
		utmMedium: z.string().trim().max(240).optional(),
		utmCampaign: z.string().trim().max(240).optional(),
		utmTerm: z.string().trim().max(240).optional(),
		utmContent: z.string().trim().max(240).optional(),
	})
	.strict()
	.refine((input) => Object.keys(input).length > 0, {
		message: "Provide at least one contact field to update.",
	});

export type PublicContactUpdateInput = z.infer<typeof publicContactUpdateInput>;
