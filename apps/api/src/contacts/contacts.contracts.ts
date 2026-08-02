import { LifecycleStage } from "@crm/db";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const contactListInput = listInput.extend({
	/** A user id, `"unassigned"`, or `"all"`. */
	owner: z.string().default("all"),
	/** A company id, `"none"`, or `"all"`. */
	company: z.string().default("all"),
	/** A `RecordSource`, or `"all"` — how a bad auto-create rule gets undone. */
	source: z.string().default("all"),
});

export type ContactListInput = z.infer<typeof contactListInput>;

/**
 * `email` is unique across the whole table, matching HubSpot, so an import can
 * be re-run without duplicating people. It is optional because a name and a
 * phone number is a real lead.
 */
export const contactCreateInput = z.object({
	firstName: z.string().trim().min(1, "A contact needs a first name."),
	lastName: z.string().trim().optional(),
	email: z.email("That is not an email address.").optional().or(z.literal("")),
	phone: z.string().trim().optional(),
	title: z.string().trim().optional(),
	companyId: z.string().nullable().optional(),
	ownerId: z.string().nullable().optional(),
	businessUnitId: z.string().optional(),
	teamId: z.string().nullable().optional(),
	customValues: z.record(z.string(), z.unknown()).optional(),
	utmSource: z.string().trim().optional(),
	utmMedium: z.string().trim().optional(),
	utmCampaign: z.string().trim().optional(),
	utmTerm: z.string().trim().optional(),
	utmContent: z.string().trim().optional(),
});

export type ContactCreateInput = z.infer<typeof contactCreateInput>;

/** `undefined` leaves a field alone; `""` clears it. */
const contactUpdateInput = z.object({
	firstName: z.string().trim().min(1).optional(),
	lastName: z.string().optional(),
	email: z.string().optional(),
	phone: z.string().optional(),
	title: z.string().optional(),
	linkedinUrl: z.string().optional(),
	twitterUrl: z.string().optional(),
	githubUrl: z.string().optional(),
	// `summary` is deliberately absent: the research agent owns it, and a field
	// a rep can retype is a field that gets overwritten on the next run.
	companyId: z.string().nullable().optional(),
	ownerId: z.string().nullable().optional(),
	utmSource: z.string().optional(),
	utmMedium: z.string().optional(),
	utmCampaign: z.string().optional(),
	utmTerm: z.string().optional(),
	utmContent: z.string().optional(),
});

export type ContactUpdateInput = z.infer<typeof contactUpdateInput>;

export const contactUpdateArgs = z.object({
	id: z.string(),
	data: contactUpdateInput,
});

export const contactIdInput = z.object({ id: z.string() });

export const contactLifecycleInput = z
	.object({
		contactId: z.string(),
		businessUnitId: z.string(),
		teamId: z.string().nullable().optional(),
		ownerId: z.string().nullable().optional(),
		lifecycleStage: z.enum(LifecycleStage),
		marketingScore: z.number().finite().nullable().optional(),
		qualificationReason: z.string().trim().max(1000).nullable().optional(),
	})
	.superRefine((input, ctx) => {
		if (
			input.lifecycleStage === LifecycleStage.MQL &&
			!input.qualificationReason
		) {
			ctx.addIssue({
				code: "custom",
				path: ["qualificationReason"],
				message: "Explain why this contact is marketing qualified.",
			});
		}
	});

export type ContactLifecycleInput = z.infer<typeof contactLifecycleInput>;

/**
 * A rep settling a proposal the agent could not settle itself.
 *
 * This is the one place the API touches enrichment output, and it is not
 * enrichment: no research, no scoring, no judgement about a person — a human
 * pressed accept, and the record follows. The decision is also the label that
 * calibrates the confidence model, which is why `decidedById` is stored rather
 * than the row simply being deleted.
 */
export const factDecisionInput = z.object({
	factId: z.string(),
	decision: z.enum(["accept", "dismiss"]),
});

export type FactDecisionInput = z.infer<typeof factDecisionInput>;
