import type { RouterOutputs } from "@/lib/trpc/types";

export type Analytics = RouterOutputs["dashboard"]["analytics"];
export type AnalyticsView = Analytics["views"][number];

export function chartRows(
	view: AnalyticsView,
): Array<Record<string, string | number>> {
	return view.chart.data.labels.map((label, index) => ({
		label,
		value: view.chart.data.datasets[0]?.data[index] ?? 0,
		...Object.fromEntries(
			view.chart.data.datasets.map((dataset, datasetIndex) => [
				seriesKey(dataset.label, datasetIndex),
				dataset.data[index] ?? 0,
			]),
		),
	}));
}

export function chartConfig(view: AnalyticsView) {
	return Object.fromEntries(
		view.chart.data.datasets.map((dataset, index) => [
			seriesKey(dataset.label, index),
			{ label: dataset.label, color: `var(--chart-${(index % 5) + 1})` },
		]),
	);
}

export function chartSeries(view: AnalyticsView) {
	return view.chart.data.datasets.map((dataset, index) =>
		seriesKey(dataset.label, index),
	);
}

export function analyticsRowLabel(row: Record<string, string | number | null>) {
	if (row.label != null) return String(row.label);
	if (row.period != null) return String(row.period);
	if (row.stage != null)
		return row.pipeline ? `${row.pipeline} · ${row.stage}` : String(row.stage);
	if (row.outcome != null)
		return String(row.outcome).toLowerCase().replaceAll("_", " ");
	if (row.fromStage != null || row.toStage != null)
		return `${String(row.fromStage ?? "Start")} → ${String(row.toStage ?? "End")}`;
	return "Unknown";
}

export function analyticsRowValue(row: Record<string, string | number | null>) {
	if (row.deals != null) return `${row.deals} deals`;
	if (row.transitions != null) return `${row.transitions} transitions`;
	if (row.created != null)
		return `${row.created} created · ${row.won ?? 0} won`;
	if (row.value != null) return String(row.value);
	return "—";
}

function seriesKey(label: string, index: number) {
	return `${
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_|_$/g, "") || "value"
	}_${index}`;
}

export function formatMetric(value: number | string) {
	return typeof value === "number"
		? new Intl.NumberFormat().format(value)
		: value;
}

export function formatPeriodLabel(
	value: string,
	grain: "hour" | "day" | "week" | "month" | "quarter",
) {
	if (grain === "hour") return value.slice(5);
	if (grain === "day") return value.slice(5);
	if (grain === "week") return value.replace(/^Week of \d{4}-/, "Week ");
	return value;
}
