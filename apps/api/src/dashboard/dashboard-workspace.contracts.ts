import { z } from "zod";
import { dashboardDefinitionSpec } from "./dashboard-definition.contracts";

export const dashboardWorkspaceListInput = z.object({
	scope: z.enum(["all", "mine", "public"]).default("all"),
	q: z.string().trim().max(120).default(""),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(24),
});

export const dashboardWorkspaceIdInput = z.object({ id: z.string().min(1) });

export const dashboardWorkspaceCreateInput = z.object({
	name: z.string().trim().min(1).max(160),
	description: z.string().trim().max(500).nullable().optional(),
	visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
});

export const dashboardWorkspaceUpdateInput = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(1).max(160).optional(),
	description: z.string().trim().max(500).nullable().optional(),
	visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
});

export const dashboardWidgetCreateInput = z.object({
	dashboardId: z.string().min(1),
	title: z.string().trim().min(1).max(160),
	description: z.string().trim().max(500).nullable().optional(),
	spec: dashboardDefinitionSpec,
	width: z.number().int().min(3).max(12).default(6),
});

export const dashboardWidgetUpdateInput = z.object({
	id: z.string().min(1),
	title: z.string().trim().min(1).max(160).optional(),
	description: z.string().trim().max(500).nullable().optional(),
	width: z.number().int().min(3).max(12).optional(),
});

export const dashboardWidgetLayoutInput = z.object({
	dashboardId: z.string().min(1),
	widgets: z
		.array(
			z.object({
				id: z.string().min(1),
				position: z.number().int().min(0),
				width: z.number().int().min(3).max(12),
			}),
		)
		.max(100),
});

export const dashboardWidgetIdInput = z.object({ id: z.string().min(1) });

export type DashboardWorkspaceListInput = z.infer<
	typeof dashboardWorkspaceListInput
>;
export type DashboardWorkspaceCreateInput = z.infer<
	typeof dashboardWorkspaceCreateInput
>;
export type DashboardWorkspaceUpdateInput = z.infer<
	typeof dashboardWorkspaceUpdateInput
>;
export type DashboardWidgetCreateInput = z.infer<
	typeof dashboardWidgetCreateInput
>;
export type DashboardWidgetUpdateInput = z.infer<
	typeof dashboardWidgetUpdateInput
>;
export type DashboardWidgetLayoutInput = z.infer<
	typeof dashboardWidgetLayoutInput
>;
