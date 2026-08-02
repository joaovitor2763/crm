import { BadRequestException } from "@nestjs/common";
import {
	ANALYTICS_DIMENSIONS,
	type AnalyticsDimension,
	type ChartCdnDefinition,
	type DashboardAnalyticsInput,
} from "./analytics.contracts";
import type { DashboardService } from "./dashboard.service";
import type { DashboardDefinitionSpec } from "./dashboard-definition.contracts";
import type { StoredDefinition } from "./dashboard-definition.service";

const analyticsDimensionSet = new Set<string>(ANALYTICS_DIMENSIONS);

export function analyticsInputForDefinition(
	spec: DashboardDefinitionSpec,
): DashboardAnalyticsInput {
	const pipelineId = spec.filters.find(
		(filter) => filter.key === "pipelineId",
	)?.value;
	const attributeKey = spec.filters.find(
		(filter) => filter.key === "attributeKey",
	)?.value;
	const dimensions = [...new Set([...spec.groupBy, ...spec.breakdowns])].filter(
		(dimension): dimension is AnalyticsDimension =>
			analyticsDimensionSet.has(dimension),
	);
	return {
		scope: "everyone",
		from: spec.timeRange.from,
		to: spec.timeRange.to,
		pipelineId,
		attributeKey,
		dimensions,
		grain: spec.timeRange.grain,
		comparison: spec.comparison,
		limit: 100,
	};
}

export function renderDefinition(
	definition: Pick<StoredDefinition, "id" | "key" | "version" | "status">,
	spec: DashboardDefinitionSpec,
	analytics: Awaited<ReturnType<DashboardService["analytics"]>>,
) {
	const viewKey =
		spec.metric === "conversionRate"
			? "timeSeries"
			: spec.metric === "conversionTime"
				? "conversionTime"
				: spec.metric === "stageRate" || spec.metric === "stageTime"
					? "stagePerformance"
					: spec.metric === "breakdown"
						? "breakdown"
						: "conversionFunnel";
	const view = analytics.views.find((candidate) => candidate.key === viewKey);
	if (!view)
		throw new BadRequestException(`Analytics view ${viewKey} is unavailable.`);
	const chartType: ChartCdnDefinition["type"] = [
		"bar",
		"line",
		"doughnut",
	].includes(spec.visualization)
		? (spec.visualization as ChartCdnDefinition["type"])
		: view.chart.type;
	const baseChart =
		spec.metric === "stageTime"
			? stageTimeChart(view.chart, view.rows)
			: view.chart;
	const chart: ChartCdnDefinition = {
		...baseChart,
		type: chartType,
		options: {
			...(baseChart.options ?? {}),
			...spec.options,
		},
	};
	return {
		definitionId: definition.id,
		key: definition.key,
		version: definition.version,
		status: definition.status,
		metric: spec.metric,
		visualization: spec.visualization,
		layout: spec.layout,
		comparison: spec.comparison,
		comparisonSupport:
			spec.comparison === "none"
				? { supported: true }
				: {
						supported: false,
						reason: "Comparison windows are not materialized yet.",
					},
		window: analytics.window,
		view: { ...view, chart },
		chart,
	};
}

function stageTimeChart(
	chart: ChartCdnDefinition,
	rows: Array<Record<string, string | number | null>>,
): ChartCdnDefinition {
	return {
		...chart,
		data: {
			labels: rows.map(
				(row) =>
					`${String(row.fromStage ?? "Stage")} → ${String(row.toStage ?? "Stage")}`,
			),
			datasets: [
				{
					label: "Average days between stages",
					data: rows.map((row) =>
						typeof row.avgDays === "number" ? row.avgDays : 0,
					),
				},
			],
		},
	};
}

export function latestVersions(rows: StoredDefinition[]) {
	const latest = new Map<string, StoredDefinition>();
	for (const row of rows) {
		const current = latest.get(row.key);
		if (!current || row.version > current.version) latest.set(row.key, row);
	}
	return [...latest.values()];
}

export function serializeDefinition(row: StoredDefinition) {
	return {
		...row,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		publishedAt: row.publishedAt?.toISOString() ?? null,
		archivedAt: row.archivedAt?.toISOString() ?? null,
	};
}
