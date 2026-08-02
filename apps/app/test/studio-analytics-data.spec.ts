import { describe, expect, it } from "bun:test";
import {
	chartConfig,
	chartRows,
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
			{ label: "Paid", value: 4 },
			{ label: "Organic", value: 2 },
		]);
		expect(chartConfig(view)).toEqual({
			value: { label: "By channel", color: "var(--chart-1)" },
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
			{ label: "Open", value: 3 },
			{ label: "Won", value: 0 },
		]);
	});
});
