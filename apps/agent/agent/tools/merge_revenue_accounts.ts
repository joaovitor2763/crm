import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertRevenueAccount } from "../lib/access";
import { sensitiveWrite } from "../lib/approval";
import { executeRevenueAccountMerge } from "../lib/revenue-account-merge";

export default defineTool({
	description:
		"Merge two exact commercial Conta (RevenueAccount) ids only after a rep approves the exact source, target and field policies. Scheduled or ambiguous merges are denied; every mutation keeps relations, attribute history and lineage under one operationId. Never infer ids or policies.",
	inputSchema: z.object({
		sourceAccountId: z.string(),
		targetAccountId: z.string(),
		fieldPolicies: z.record(
			z.string(),
			z.enum(["TARGET", "SOURCE", "UNION", "SKIP"]),
		),
		operationId: z
			.string()
			.optional()
			.describe(
				"Reuse the operationId from a reviewed preview when available.",
			),
	}),
	approval: sensitiveWrite(
		"RevenueAccount merges are never run unattended; a human must approve the exact source, target and field policies.",
	),
	async execute(
		{ sourceAccountId, targetAccountId, fieldPolicies, operationId },
		ctx,
	) {
		const access = await assertRevenueAccount(
			ctx,
			sourceAccountId,
			PermissionAction.UPDATE,
		);
		await assertRevenueAccount(ctx, targetAccountId, PermissionAction.UPDATE);
		return executeRevenueAccountMerge(
			sourceAccountId,
			targetAccountId,
			fieldPolicies,
			access,
			operationId,
		);
	},
});
