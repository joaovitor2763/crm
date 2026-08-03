import { describe, expect, it } from "bun:test";
import {
	chartConfig,
	chartRows,
	formatPeriodLabel,
} from "@/app/(app)/studio/studio-analytics-data";

describe("Studio analytics presentation", () => {
	it("maps the ChartCDN payload into the shared bar chart shape", () => {
		const view = {
			key: "breakdown",
			title: "By channel",
			description: "Deals by channel",
			chart: {
				type: "bar",
				data: {
					labels: ["Paid", "Organic"],
					datasets: [{ label: "Deals", data: [4, 2] }],
				},
			},
			rows: [],
		} as never;

		expect(chartRows(view)).toEqual([
			{ deals_0: 4, label: "Paid", value: 4 },
			{ deals_0: 2, label: "Organic", value: 2 },
		]);
		expect(chartConfig(view)).toEqual({
			deals_0: { label: "Deals", color: "var(--chart-1)" },
		});
	});

	it("fills a missing dataset value with zero", () => {
		const view = {
			title: "Funnel",
			chart: {
				data: {
					labels: ["Open", "Won"],
					datasets: [{ label: "Deals", data: [3] }],
				},
			},
		} as never;
		expect(chartRows(view)).toEqual([
			{ deals_0: 3, label: "Open", value: 3 },
			{ deals_0: 0, label: "Won", value: 0 },
		]);
	});

	it("keeps hourly and weekly periods distinguishable", () => {
		expect(formatPeriodLabel("2026-08-03 09:00", "hour")).toBe("08-03 09:00");
		expect(formatPeriodLabel("Week of 2026-08-03", "week")).toBe("Week 08-03");
	});
});
