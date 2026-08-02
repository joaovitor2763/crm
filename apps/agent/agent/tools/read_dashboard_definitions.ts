import { PermissionAction } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { crmAccess } from "../lib/access";
import { readDashboardDefinitions } from "../lib/dashboard-definitions";

export default defineTool({
	description:
		"List governed, versioned revenue dashboard definitions visible to the current CRM user, including metric, filters, time grain, breakdowns and ChartCDN visualization spec. Read-only; publishing and editing stay in the CRM Studio with explicit confirmation.",
	inputSchema: z.object({
		status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
		key: z.string().min(1).optional(),
		includeVersions: z.boolean().default(false),
	}),
	async execute(input, ctx) {
		const access = await crmAccess(ctx, PermissionAction.READ, "dashboards");
		return readDashboardDefinitions(access, input);
	},
});
