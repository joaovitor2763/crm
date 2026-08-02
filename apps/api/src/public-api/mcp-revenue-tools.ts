import { AccessScope, PermissionAction } from "@crm/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import type { AccessControlService } from "../access-control/access-control.service";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import {
	attributionProjectionInput,
	externalAttributionEventInput,
} from "../attribution/attribution.contracts";
import type { AttributionService } from "../attribution/attribution.service";
import {
	ANALYTICS_DIMENSIONS,
	dashboardAnalyticsInput,
} from "../dashboard/analytics.contracts";
import type { DashboardService } from "../dashboard/dashboard.service";
import {
	revenueAccountCreateInput,
	revenueAccountListInput,
	revenueAccountMergeInput,
	revenueAccountMergePreviewInput,
} from "../revenue-accounts/revenue-accounts.contracts";
import type { RevenueAccountsService } from "../revenue-accounts/revenue-accounts.service";
import { toolResult } from "./mcp-result";

export function registerRevenueArchitectureTools(
	server: McpServer,
	dependencies: {
		accounts: RevenueAccountsService;
		attribution: AttributionService;
		dashboard: DashboardService;
		accessControl: AccessControlService;
		principal: EffectivePrincipal;
	},
) {
	const { accounts, dashboard, accessControl, principal } = dependencies;

	server.registerTool(
		"record_attribution_event",
		{
			description:
				"Record an append-only attribution touch for a governed revenue element.",
			inputSchema: externalAttributionEventInput,
		},
		async (input) =>
			toolResult(await dependencies.attribution.record(input, principal)),
	);

	server.registerTool(
		"read_attribution_lineage",
		{
			description:
				"Read explainable first/current attribution and recurring conversion history.",
			inputSchema: attributionProjectionInput,
		},
		async (input) =>
			toolResult(await dependencies.attribution.projection(input, principal)),
	);

	server.registerTool(
		"search_revenue_accounts",
		{
			description:
				"Search governed commercial Accounts visible to this credential.",
			inputSchema: {
				query: z.string().trim().max(240).default(""),
				limit: z.number().int().min(1).max(100).default(25),
			},
		},
		async ({ query, limit }) =>
			toolResult(
				await accounts.list(
					revenueAccountListInput.parse({ q: query, pageSize: limit }),
					principal,
				),
			),
	);

	server.registerTool(
		"create_revenue_account",
		{
			description:
				"Create a governed commercial Account when its identity is unambiguous.",
			inputSchema: revenueAccountCreateInput,
		},
		async (input) => toolResult(await accounts.create(input, principal)),
	);

	server.registerTool(
		"get_revenue_account",
		{
			description: "Read one Account, its visible relations and lineage.",
			inputSchema: { id: z.string() },
		},
		async ({ id }) =>
			toolResult({
				account: await accounts.byId(id, principal),
				history: await accounts.history(id, principal),
			}),
	);

	server.registerTool(
		"preview_revenue_account_merge",
		{
			description:
				"Preview Account conflicts and relation movement without changing data.",
			inputSchema: revenueAccountMergePreviewInput,
		},
		async (input) => toolResult(await accounts.mergePreview(input, principal)),
	);

	server.registerTool(
		"merge_revenue_accounts",
		{
			description:
				"Merge two Accounts only after an explicit reviewed confirmation.",
			inputSchema: revenueAccountMergeInput.extend({
				confirmed: z.literal(true),
			}),
		},
		async ({ confirmed: _, ...input }) =>
			toolResult(await accounts.merge(input, principal)),
	);

	server.registerTool(
		"read_revenue_analytics",
		{
			description:
				"Build governed conversion, stage-time and attribution views.",
			inputSchema: {
				from: z.string().optional(),
				to: z.string().optional(),
				pipelineId: z.string().optional(),
				dimensions: z.array(z.enum(ANALYTICS_DIMENSIONS)).optional(),
				attributeKey: z.string().optional(),
				limit: z.number().int().min(1).max(100).optional(),
			},
		},
		async (input) => {
			const analyticsInput = dashboardAnalyticsInput.parse({
				...input,
				scope: "everyone",
			});
			const contactPermission = accessControl.permission(
				principal,
				CRM_RESOURCE.contacts,
				PermissionAction.READ,
			);
			return toolResult(
				await dashboard.analytics(
					principal,
					"",
					analyticsInput,
					accessControl.dealWhere(
						principal,
						CRM_RESOURCE.deals,
						PermissionAction.READ,
					),
					accessControl.activityWhere(
						principal,
						CRM_RESOURCE.activities,
						PermissionAction.READ,
					),
					accessControl.configurationWhere(
						principal,
						CRM_RESOURCE.pipelines,
						PermissionAction.READ,
						true,
					),
					contactPermission === AccessScope.NONE
						? { id: { in: [] } }
						: accessControl.contactWhere(
								principal,
								CRM_RESOURCE.contacts,
								PermissionAction.READ,
							),
				),
			);
		},
	);
}
