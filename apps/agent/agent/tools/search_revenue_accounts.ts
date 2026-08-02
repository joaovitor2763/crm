import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { crmAccess } from "../lib/access";
import { searchRevenueAccounts } from "../lib/revenue-accounts";

export default defineTool({
	description:
		"Find commercial Conta records (RevenueAccount), not Better Auth accounts, by name or domain. Returns scoped matches with stable ids and governed custom fields. Free and read-only; use it before any tool that needs a RevenueAccount id.",
	inputSchema: z.object({
		query: z.string().min(2).describe("A commercial account name or domain."),
		limit: z.number().int().min(1).max(25).default(10),
	}),
	async execute({ query, limit }, ctx) {
		const access = await crmAccess(
			ctx,
			PermissionAction.READ,
			"revenue-accounts",
		);
		const result = await searchRevenueAccounts(query, access, limit);
		return {
			...result,
			note:
				result.total > 1
					? "Several Conta records match. Name the candidates and ask which one the rep means; never choose an ambiguous id."
					: result.total === 0
						? "No scoped commercial Conta record matches this query."
						: undefined,
		};
	},
});
