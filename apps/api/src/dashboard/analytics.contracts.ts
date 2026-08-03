import { z } from "zod";

export const ANALYTICS_DIMENSIONS = [
	"channel",
	"owner",
	"utmSource",
	"utmMedium",
	"utmCampaign",
	"utmTerm",
	"utmContent",
	"dealAttribute",
] as const;

export type AnalyticsDimension = (typeof ANALYTICS_DIMENSIONS)[number];

const dateInput = z
	.string()
	.trim()
	.refine((value) => !Number.isNaN(Date.parse(value)), "Use an ISO date.");

export const dashboardAnalyticsInput = z
	.object({
		scope: z.enum(["me", "everyone"]).default("me"),
		from: dateInput.optional(),
		to: dateInput.optional(),
		pipelineId: z.string().trim().min(1).optional(),
		dimensions: z
			.array(z.enum(ANALYTICS_DIMENSIONS))
			.max(ANALYTICS_DIMENSIONS.length)
			.default(["channel", "owner", "utmSource", "utmMedium", "utmCampaign"]),
		attributeKey: z.string().trim().min(1).max(80).optional(),
		grain: z.enum(["hour", "day", "week", "month", "quarter"]).optional(),
		comparison: z.enum(["none", "previousPeriod", "previousYear"]).optional(),
		limit: z.number().int().min(1).max(100).default(25),
	})
	.superRefine((input, context) => {
		if (input.from && input.to && new Date(input.from) > new Date(input.to)) {
			context.addIssue({
				code: "custom",
				path: ["to"],
				message: "The end of the window cannot be before its start.",
			});
		}
		if (input.dimensions.includes("dealAttribute") && !input.attributeKey) {
			context.addIssue({
				code: "custom",
				path: ["attributeKey"],
				message: "attributeKey is required for a deal attribute breakdown.",
			});
		}
	});

export type DashboardAnalyticsInput = z.infer<typeof dashboardAnalyticsInput>;

export type ChartCdnChartType = "bar" | "line" | "doughnut";

export type ChartCdnDataset = {
	label: string;
	data: number[];
	backgroundColor?: string | string[];
	borderColor?: string | string[];
	borderWidth?: number;
	fill?: boolean;
};

/** JSON-only Chart.js/ChartCDN payload; no functions or class instances cross the API. */
export type ChartCdnDefinition = {
	type: ChartCdnChartType;
	data: {
		labels: string[];
		datasets: ChartCdnDataset[];
	};
	options?: Record<string, unknown>;
};

export type AnalyticsView = {
	key:
		| "conversionFunnel"
		| "conversionTime"
		| "stagePerformance"
		| "breakdown"
		| "timeSeries";
	title: string;
	description: string;
	chart: ChartCdnDefinition;
	rows: Array<Record<string, string | number | null>>;
};
