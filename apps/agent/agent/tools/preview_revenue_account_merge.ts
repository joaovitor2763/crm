import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertRevenueAccount } from "../lib/access";
import { previewRevenueAccountMerge } from "../lib/revenue-accounts";

export default defineTool({
	description:
		"Preview a commercial Conta merge using two exact scoped RevenueAccount ids. Read-only: shows governed field conflicts, relation counts and an operationId, but never executes anything. A merge still requires explicit human approval and an explicit policy for every conflict.",
	inputSchema: z.object({
		sourceAccountId: z.string(),
		targetAccountId: z.string(),
	}),
	async execute({ sourceAccountId, targetAccountId }, ctx) {
		const access = await assertRevenueAccount(
			ctx,
			sourceAccountId,
			PermissionAction.UPDATE,
		);
		await assertRevenueAccount(ctx, targetAccountId, PermissionAction.UPDATE);
		const preview = await previewRevenueAccountMerge(
			sourceAccountId,
			targetAccountId,
			access,
		);
		return preview
			? { found: true as const, ...preview }
			: {
					found: false as const,
					reason: "One or both RevenueAccounts are outside your scope.",
				};
	},
});
