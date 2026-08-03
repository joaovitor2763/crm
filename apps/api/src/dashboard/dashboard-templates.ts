import type { DashboardDefinitionSpec } from "./dashboard-definition.contracts";

export type StandardDashboardTemplate = {
	key: string;
	name: string;
	description: string;
	spec: DashboardDefinitionSpec;
};

const base = {
	population: "deals" as const,
	filters: [],
	timeRange: { grain: "month" as const, timezone: "UTC" },
	breakdowns: [],
	comparison: "previousPeriod" as const,
	visualization: "bar" as const,
	options: {},
	layout: { x: 0, y: 0, w: 6, h: 4 },
};

export const STANDARD_DASHBOARD_TEMPLATES: readonly StandardDashboardTemplate[] =
	[
		{
			key: "conversion-rate",
			name: "Conversion rate",
			description: "Funnel conversion by pipeline stage.",
			spec: {
				...base,
				metric: "conversionRate",
				groupBy: ["pipeline", "stage"],
			},
		},
		{
			key: "conversion-time",
			name: "Time to conversion",
			description: "Average and median time from creation to outcome.",
			spec: { ...base, metric: "conversionTime", groupBy: ["pipeline"] },
		},
		{
			key: "stage-rates",
			name: "Stage rates",
			description: "Rate between adjacent stages.",
			spec: { ...base, metric: "stageRate", groupBy: ["stage"] },
		},
		{
			key: "stage-times",
			name: "Stage times",
			description: "Elapsed time between adjacent stages.",
			spec: { ...base, metric: "stageTime", groupBy: ["stage"] },
		},
		{
			key: "channel-performance",
			name: "Channel performance",
			description: "Conversion, volume and value by channel.",
			spec: { ...base, metric: "breakdown", groupBy: ["channel"] },
		},
		{
			key: "owner-performance",
			name: "Owner performance",
			description: "Conversion, volume and value by seller.",
			spec: { ...base, metric: "breakdown", groupBy: ["owner"] },
		},
		{
			key: "utm-performance",
			name: "UTM performance",
			description: "Conversion by UTM source and campaign.",
			spec: {
				...base,
				metric: "breakdown",
				groupBy: ["utmSource", "utmCampaign"],
			},
		},
		{
			key: "deal-attribute-performance",
			name: "Deal attribute performance",
			description: "A reusable cut by a governed Deal attribute.",
			spec: {
				...base,
				metric: "breakdown",
				groupBy: ["dealAttribute"],
				filters: [{ key: "attributeKey", operator: "eq", value: "replace-me" }],
			},
		},
		{
			key: "macro-bowtie",
			name: "Macro bowtie",
			description: "The company-level revenue motion across all pipelines.",
			spec: {
				...base,
				metric: "macroBowtie",
				groupBy: ["pipeline", "stage"],
				visualization: "funnel",
			},
		},
	];

export function standardDashboardTemplates() {
	return STANDARD_DASHBOARD_TEMPLATES.map((template) => ({
		...template,
		spec: {
			...template.spec,
			filters: [...template.spec.filters],
			groupBy: [...template.spec.groupBy],
			breakdowns: [...template.spec.breakdowns],
			options: { ...template.spec.options },
			layout: { ...template.spec.layout },
			timeRange: { ...template.spec.timeRange },
		},
	}));
}
