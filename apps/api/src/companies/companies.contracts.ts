import { z } from "zod";
import { listInput } from "../trpc/list-input";

/**
 * The companies list adds three facets to the shared list input. Each defaults
 * to `"all"`, which is also what the URL parsers on the front end send when a
 * dropdown is untouched — so an unfiltered request and an unfiltered URL are
 * the same request.
 */
export const companyListInput = listInput.extend({
	/** A user id, `"unassigned"`, or `"all"`. */
	owner: z.string().default("all"),
	industry: z.string().default("all"),
	/** An `EnrichmentStatus`, or `"all"`. */
	enrichment: z.string().default("all"),
	/**
	 * A `RecordSource`, or `"all"`.
	 *
	 * What makes an auto-create rule reversible: filter to `EMAIL`, see exactly
	 * what the sync decided, and delete the lot if it got it wrong.
	 */
	source: z.string().default("all"),
});

export type CompanyListInput = z.infer<typeof companyListInput>;

/**
 * Creating a company asks for the three things a human actually knows. The
 * logo, description, industry, address and socials are the agent's job.
 */
export const companyCreateInput = z.object({
	name: z.string().trim().min(1, "A company needs a name."),
	domain: z.string().trim().optional(),
	ownerId: z.string().nullable().optional(),
	businessUnitId: z.string().optional(),
	teamId: z.string().nullable().optional(),
	customValues: z.record(z.string(), z.unknown()).optional(),
});

export type CompanyCreateInput = z.infer<typeof companyCreateInput>;

/**
 * Every field is optional and `undefined` means "leave it alone", so the inline
 * editors on the detail page can send one field at a time. An empty string
 * clears a value; `null` on `ownerId` unassigns.
 */
const companyUpdateInput = z.object({
	name: z.string().trim().min(1).optional(),
	domain: z.string().optional(),
	website: z.string().optional(),
	description: z.string().optional(),
	industry: z.string().optional(),
	city: z.string().optional(),
	stateCode: z.string().optional(),
	country: z.string().optional(),
	phone: z.string().optional(),
	email: z.string().optional(),
	linkedinUrl: z.string().optional(),
	ownerId: z.string().nullable().optional(),
});

export type CompanyUpdateInput = z.infer<typeof companyUpdateInput>;

export const companyUpdateArgs = z.object({
	id: z.string(),
	data: companyUpdateInput,
});

export const companyIdInput = z.object({ id: z.string() });

export const setPrimaryContactInput = z.object({
	companyId: z.string(),
	contactId: z.string().nullable(),
});

/** Free-text filter for the company picker; `""` means "the first hundred". */
export const companyOptionsInput = z.object({
	q: z.string().default(""),
});
