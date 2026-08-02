export const DASHBOARD_METRICS = [
	"conversionRate",
	"conversionTime",
	"stageRate",
	"stageTime",
	"breakdown",
	"macroBowtie",
] as const;

export const DASHBOARD_DIMENSIONS = [
	"channel",
	"owner",
	"utmSource",
	"utmMedium",
	"utmCampaign",
	"utmTerm",
	"utmContent",
	"dealAttribute",
	"pipeline",
	"stage",
] as const;

export const DASHBOARD_VISUALIZATIONS = [
	"bar",
	"line",
	"doughnut",
	"table",
	"kpi",
] as const;

export const DASHBOARD_GRAINS = ["day", "week", "month", "quarter"] as const;

export type DashboardMetric = (typeof DASHBOARD_METRICS)[number];
export type DashboardDimension = (typeof DASHBOARD_DIMENSIONS)[number];
export type DashboardVisualization = (typeof DASHBOARD_VISUALIZATIONS)[number];
export type DashboardGrain = (typeof DASHBOARD_GRAINS)[number];

export type DashboardSpec = {
	metric: DashboardMetric;
	population: "deals" | "closedDeals" | "pipelineEntries";
	filters: Array<{
		key: "pipelineId" | "attributeKey";
		operator: "eq";
		value: string;
	}>;
	timeRange: {
		from?: string;
		to?: string;
		grain: DashboardGrain;
		timezone: string;
	};
	groupBy: DashboardDimension[];
	breakdowns: DashboardDimension[];
	comparison: "none" | "previousPeriod" | "previousYear";
	visualization: DashboardVisualization;
	options: Record<string, unknown>;
	layout: { x: number; y: number; w: number; h: number };
};

export type DashboardDraft = {
	key: string;
	name: string;
	description: string;
	spec: DashboardSpec;
};

export const DEFAULT_DASHBOARD_SPEC: DashboardSpec = {
	metric: "conversionRate",
	population: "deals",
	filters: [],
	timeRange: { grain: "month", timezone: "UTC" },
	groupBy: ["pipeline", "stage"],
	breakdowns: [],
	comparison: "none",
	visualization: "bar",
	options: {},
	layout: { x: 0, y: 0, w: 6, h: 4 },
};

export function dashboardDraft(
	value?: Partial<DashboardDraft> & { spec?: Partial<DashboardSpec> },
): DashboardDraft {
	return {
		key: value?.key ?? "",
		name: value?.name ?? "",
		description: value?.description ?? "",
		spec: {
			...DEFAULT_DASHBOARD_SPEC,
			...value?.spec,
			timeRange: {
				...DEFAULT_DASHBOARD_SPEC.timeRange,
				...value?.spec?.timeRange,
			},
			filters: value?.spec?.filters ?? DEFAULT_DASHBOARD_SPEC.filters,
			groupBy: value?.spec?.groupBy ?? DEFAULT_DASHBOARD_SPEC.groupBy,
			breakdowns: value?.spec?.breakdowns ?? DEFAULT_DASHBOARD_SPEC.breakdowns,
			options: value?.spec?.options ?? {},
			layout: {
				...DEFAULT_DASHBOARD_SPEC.layout,
				...value?.spec?.layout,
			},
		},
	};
}

export function withDimension(
	value: DashboardSpec,
	dimension: DashboardDimension,
): DashboardSpec {
	return {
		...value,
		groupBy: value.groupBy.includes(dimension)
			? value.groupBy
			: [...value.groupBy, dimension].slice(0, 3),
	};
}

export function withAttributeFilter(
	value: DashboardSpec,
	attributeKey: string,
): DashboardSpec {
	const filters = value.filters.filter(
		(filter) => filter.key !== "attributeKey",
	);
	return attributeKey.trim()
		? {
				...value,
				filters: [
					...filters,
					{ key: "attributeKey", operator: "eq", value: attributeKey.trim() },
				],
			}
		: { ...value, filters };
}
