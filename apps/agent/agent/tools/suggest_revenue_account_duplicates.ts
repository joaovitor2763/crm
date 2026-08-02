import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertRevenueAccount } from "../lib/access";
import { suggestRevenueAccountDuplicates } from "../lib/revenue-accounts";

export default defineTool({
	description:
		"Suggest possible duplicate commercial Conta records for an exact RevenueAccount id. Evidence and confidence are derived only from observed CRM name, domain and shared relations; the model cannot supply a score. Suggestions never mutate data and low-confidence matches remain ambiguous.",
	inputSchema: z.object({
		revenueAccountId: z.string(),
		limit: z.number().int().min(1).max(10).default(5),
	}),
	async execute({ revenueAccountId, limit }, ctx) {
		const access = await assertRevenueAccount(
			ctx,
			revenueAccountId,
			PermissionAction.READ,
		);
		const result = await suggestRevenueAccountDuplicates(
			revenueAccountId,
			access,
			limit,
		);
		return result
			? { found: true as const, ...result }
			: {
					found: false as const,
					reason: "No scoped RevenueAccount with that id.",
				};
	},
});
