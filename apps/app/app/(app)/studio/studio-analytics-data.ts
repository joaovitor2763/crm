import type { RouterOutputs } from "@/lib/trpc/types";

export type Analytics = RouterOutputs["dashboard"]["analytics"];
export type AnalyticsView = Analytics["views"][number];

export function chartRows(view: AnalyticsView) {
	const dataset = view.chart.data.datasets[0];
	return view.chart.data.labels.map((label, index) => ({
		label,
		value: dataset?.data[index] ?? 0,
	}));
}

export function chartConfig(view: AnalyticsView) {
	return {
		value: { label: view.title, color: "var(--chart-1)" },
	};
}

export function formatMetric(value: number | string) {
	return typeof value === "number"
		? new Intl.NumberFormat().format(value)
		: value;
}
