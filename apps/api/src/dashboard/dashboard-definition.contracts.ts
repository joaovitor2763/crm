import { z } from "zod";
import { ANALYTICS_DIMENSIONS, analyticsXyInput } from "./analytics.contracts";

const analyticsDimensionSet = new Set<string>(ANALYTICS_DIMENSIONS);

export const DASHBOARD_DIMENSIONS = [
	...ANALYTICS_DIMENSIONS,
	"pipeline",
	"stage",
] as const;

export const DASHBOARD_METRICS = [
	"conversionRate",
	"conversionTime",
	"stageRate",
	"stageTime",
	"breakdown",
	"macroBowtie",
	"xy",
] as const;

export const dashboardMetric = z.enum(DASHBOARD_METRICS);
export const dashboardDimension = z.enum(DASHBOARD_DIMENSIONS);
export const dashboardStatus = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const dashboardVisualization = z.enum([
	"bar",
	"line",
	"area",
	"doughnut",
	"pie",
	"radial",
	"funnel",
	"table",
	"kpi",
]);
export const dashboardTimeGrain = z.enum([
	"hour",
	"day",
	"week",
	"month",
	"quarter",
]);
export const dashboardComparison = z.enum([
	"none",
	"previousPeriod",
	"previousYear",
]);

const dateValue = z
	.string()
	.trim()
	.refine((value) => !Number.isNaN(Date.parse(value)), "Use an ISO date.");

const dashboardFilter = z.object({
	key: z.enum(["pipelineId", "attributeKey"]),
	operator: z.enum(["eq"]),
	value: z.string().trim().min(1),
});

const dashboardTimeRange = z
	.object({
		from: dateValue.optional(),
		to: dateValue.optional(),
		grain: dashboardTimeGrain.default("month"),
		timezone: z.string().trim().min(1).max(80).default("UTC"),
	})
	.superRefine((range, context) => {
		if (range.from && range.to && new Date(range.from) >= new Date(range.to)) {
			context.addIssue({
				code: "custom",
				path: ["to"],
				message: "The end of the window must be after its start.",
			});
		}
	});

export const dashboardDefinitionSpec = z
	.object({
		metric: dashboardMetric,
		/** Axes for the `xy` metric; ignored by the canned metrics. */
		xy: analyticsXyInput.optional(),
		population: z.enum(["deals", "closedDeals", "pipelineEntries"]),
		filters: z.array(dashboardFilter).max(12).default([]),
		timeRange: dashboardTimeRange.default({
			grain: "month",
			timezone: "UTC",
		}),
		groupBy: z.array(dashboardDimension).max(3).default([]),
		breakdowns: z.array(dashboardDimension).max(3).default([]),
		comparison: dashboardComparison.default("none"),
		visualization: dashboardVisualization.default("bar"),
		options: z.record(z.string(), z.unknown()).default({}),
		layout: z
			.object({
				x: z.number().int().min(0).default(0),
				y: z.number().int().min(0).default(0),
				w: z.number().int().min(1).max(12).default(6),
				h: z.number().int().min(1).max(12).default(4),
			})
			.default({ x: 0, y: 0, w: 6, h: 4 }),
	})
	.superRefine((spec, context) => {
		const dimensions = new Set([...spec.groupBy, ...spec.breakdowns]);
		if (dimensions.has("dealAttribute")) {
			const attributeFilter = spec.filters.find(
				(filter) => filter.key === "attributeKey",
			);
			if (!attributeFilter) {
				context.addIssue({
					code: "custom",
					path: ["filters"],
					message:
						"An attributeKey filter is required for deal attribute breakdowns.",
				});
			}
		}
		if (spec.metric === "xy" && !spec.xy) {
			context.addIssue({
				code: "custom",
				path: ["xy"],
				message: "A custom view needs its x and y axes.",
			});
		}
		if (spec.metric === "breakdown" && dimensions.size === 0) {
			context.addIssue({
				code: "custom",
				path: ["groupBy"],
				message: "A breakdown metric needs at least one grouping dimension.",
			});
		}
		if (
			spec.metric === "breakdown" &&
			[...dimensions].some((dimension) => !analyticsDimensionSet.has(dimension))
		) {
			context.addIssue({
				code: "custom",
				path: ["groupBy"],
				message:
					"Breakdown dimensions must be supported by the analytics provider.",
			});
		}
	});

export const dashboardDefinitionCreateInput = z.object({
	key: z.string().trim().min(1).max(80),
	name: z.string().trim().min(1).max(160),
	description: z.string().trim().max(500).nullable().optional(),
	businessUnitId: z.string().trim().min(1).nullable().optional(),
	spec: dashboardDefinitionSpec,
});

export const dashboardDefinitionUpdateInput = z.object({
	id: z.string().trim().min(1),
	name: z.string().trim().min(1).max(160).optional(),
	description: z.string().trim().max(500).nullable().optional(),
	spec: dashboardDefinitionSpec.optional(),
});

export const dashboardDefinitionListInput = z.object({
	status: dashboardStatus.optional(),
	key: z.string().trim().max(80).optional(),
	includeVersions: z.boolean().default(false),
});

export const dashboardDefinitionIdInput = z.object({
	id: z.string().trim().min(1),
});

export const dashboardDefinitionDuplicateInput = z.object({
	id: z.string().trim().min(1),
	key: z.string().trim().min(1).max(80),
	name: z.string().trim().min(1).max(160).optional(),
});

export const dashboardDefinitionVersionInput = z.object({
	id: z.string().trim().min(1),
});

export const dashboardDefinitionPublishInput = z.object({
	id: z.string().trim().min(1),
	confirmed: z.literal(true),
});

export type DashboardDefinitionSpec = z.infer<typeof dashboardDefinitionSpec>;
export type DashboardDefinitionCreateInput = z.infer<
	typeof dashboardDefinitionCreateInput
>;
export type DashboardDefinitionUpdateInput = z.infer<
	typeof dashboardDefinitionUpdateInput
>;
export type DashboardDefinitionListInput = z.infer<
	typeof dashboardDefinitionListInput
>;
export type DashboardDefinitionDuplicateInput = z.infer<
	typeof dashboardDefinitionDuplicateInput
>;
