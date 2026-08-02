import { z } from "zod";

export const productListInput = z.object({
	includeArchived: z.boolean().default(false),
});

export const productCreateInput = z.object({
	sku: z.string().trim().min(1, "A product needs a SKU."),
	name: z.string().trim().min(1, "A product needs a name."),
	priceCents: z.number().int().min(0),
	currency: z.string().trim().length(3).default("USD"),
	businessUnitId: z.string().nullable().optional(),
});

export const productUpdateInput = z.object({
	id: z.string(),
	sku: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1).optional(),
	priceCents: z.number().int().min(0).optional(),
	currency: z.string().trim().length(3).optional(),
});

export const productIdInput = z.object({ id: z.string() });
