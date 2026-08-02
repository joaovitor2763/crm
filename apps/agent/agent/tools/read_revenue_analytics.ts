import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { crmAccess } from "../lib/access";
import { readRevenueAnalytics } from "../lib/revenue-analytics";

export default defineTool({
	description:
		"Read scoped commercial revenue analytics for deals: funnel counts and amount, win/conversion rate, owner breakdown and a JSON-only ChartCDN chart. Use exact pipeline or owner ids when supplied. Read-only and no model-authored scores.",
	inputSchema: z.object({
		from: z.string().datetime().optional(),
		to: z.string().datetime().optional(),
		pipelineId: z.string().min(1).optional(),
		ownerId: z.string().min(1).optional(),
		limit: z.number().int().min(1).max(5000).default(250),
	}),
	async execute(input, ctx) {
		const access = await crmAccess(ctx, PermissionAction.READ, "deals");
		return readRevenueAnalytics(access, input);
	},
});
