import { z } from "zod";

export const marketingListInput = z.object({
	includeArchived: z.boolean().default(false),
});

export const marketingFormCreateInput = z.object({
	name: z.string().trim().min(1, "A form needs a name."),
	externalId: z.string().trim().nullable().optional(),
	businessUnitId: z.string().nullable().optional(),
});

export const marketingFormUpdateInput = z.object({
	id: z.string(),
	name: z.string().trim().min(1).optional(),
	externalId: z.string().trim().nullable().optional(),
});

export const marketingEventCreateInput = z.object({
	name: z.string().trim().min(1, "An event needs a name."),
	startsAt: z.string().nullable().optional(),
	endsAt: z.string().nullable().optional(),
	location: z.string().trim().nullable().optional(),
	businessUnitId: z.string().nullable().optional(),
});

export const marketingEventUpdateInput = z.object({
	id: z.string(),
	name: z.string().trim().min(1).optional(),
	startsAt: z.string().nullable().optional(),
	endsAt: z.string().nullable().optional(),
	location: z.string().trim().nullable().optional(),
});

export const marketingIdInput = z.object({ id: z.string() });
