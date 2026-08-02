import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const revenueAccountTargetKind = z.enum(["CONTACT", "COMPANY", "DEAL"]);
export const relationCardinality = z.enum([
	"ONE_TO_ONE",
	"ONE_TO_MANY",
	"MANY_TO_MANY",
]);
export const mergeFieldPolicy = z.enum(["TARGET", "SOURCE", "UNION", "SKIP"]);

export const revenueAccountListInput = listInput.extend({
	owner: z.string().default("all"),
});

export const revenueAccountConfigurationInput = z.object({
	enabled: z.boolean(),
	relations: z
		.array(
			z.object({
				targetKind: revenueAccountTargetKind,
				cardinality: relationCardinality,
				attachEnabled: z.boolean().default(true),
				detachEnabled: z.boolean().default(true),
			}),
		)
		.min(1),
	mergePolicy: z.record(z.string(), mergeFieldPolicy).default({}),
});

export const revenueAccountCreateInput = z.object({
	name: z.string().trim().min(1),
	domain: z.string().trim().nullable().optional(),
	businessUnitId: z.string().optional(),
	teamId: z.string().nullable().optional(),
	ownerId: z.string().nullable().optional(),
	customValues: z.record(z.string(), z.unknown()).default({}),
});

export const revenueAccountUpdateArgs = z.object({
	id: z.string(),
	data: z.object({
		name: z.string().trim().min(1).optional(),
		domain: z.string().trim().nullable().optional(),
		businessUnitId: z.string().optional(),
		teamId: z.string().nullable().optional(),
		ownerId: z.string().nullable().optional(),
		customValues: z.record(z.string(), z.unknown()).optional(),
	}),
});

export const revenueAccountIdInput = z.object({ id: z.string() });

export const revenueAccountAssociationInput = z.object({
	revenueAccountId: z.string(),
	targetKind: revenueAccountTargetKind,
	targetId: z.string(),
});

export const revenueAccountMergePreviewInput = z.object({
	sourceAccountId: z.string(),
	targetAccountId: z.string(),
});

export const revenueAccountMergeInput = revenueAccountMergePreviewInput.extend({
	fieldPolicies: z.record(z.string(), mergeFieldPolicy).default({}),
	operationId: z.string().trim().min(1).optional(),
});

export type RevenueAccountListInput = z.infer<typeof revenueAccountListInput>;
export type RevenueAccountConfigurationInput = z.infer<
	typeof revenueAccountConfigurationInput
>;
export type RevenueAccountCreateInput = z.infer<
	typeof revenueAccountCreateInput
>;
export type RevenueAccountUpdateArgs = z.infer<typeof revenueAccountUpdateArgs>;
export type RevenueAccountAssociationInput = z.infer<
	typeof revenueAccountAssociationInput
>;
export type RevenueAccountMergePreviewInput = z.infer<
	typeof revenueAccountMergePreviewInput
>;
export type RevenueAccountMergeInput = z.infer<typeof revenueAccountMergeInput>;
