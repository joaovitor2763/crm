import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { assertRevenueAccount } from "../lib/access";
import { readRevenueAccount } from "../lib/revenue-accounts";

export default defineTool({
	description:
		"Read one commercial Conta (RevenueAccount) by exact id, including only in-scope contacts, companies and deals plus attribute history and lineage grouped by operationId. Better Auth Account records are a different entity. Free and read-only.",
	inputSchema: z.object({
		revenueAccountId: z
			.string()
			.describe("The exact RevenueAccount id from search or a prior result."),
		lineageLimit: z.number().int().min(1).max(100).default(50),
	}),
	async execute({ revenueAccountId, lineageLimit }, ctx) {
		const access = await assertRevenueAccount(
			ctx,
			revenueAccountId,
			PermissionAction.READ,
		);
		const account = await readRevenueAccount(
			revenueAccountId,
			access,
			lineageLimit,
		);
		return account
			? { found: true as const, account }
			: {
					found: false as const,
					reason: "No scoped RevenueAccount with that id.",
				};
	},
});
