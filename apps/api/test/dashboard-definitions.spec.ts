import { describe, expect, it } from "bun:test";
import {
	dashboardDefinitionPublishInput,
	dashboardDefinitionSpec,
} from "../src/dashboard/dashboard-definition.contracts";
import {
	analyticsInputForDefinition,
	renderDefinition,
} from "../src/dashboard/dashboard-definition.service";
import { standardDashboardTemplates } from "../src/dashboard/dashboard-templates";

describe("dashboard definition contract", () => {
	it("ships standard revenue views as provider-neutral templates", () => {
		const templates = standardDashboardTemplates();
		expect(templates.map((template) => template.key)).toEqual([
			"conversion-rate",
			"conversion-time",
			"stage-rates",
			"stage-times",
			"channel-performance",
			"owner-performance",
			"utm-performance",
			"deal-attribute-performance",
			"macro-bowtie",
		]);
		for (const template of templates)
			expect(dashboardDefinitionSpec.parse(template.spec)).toBeTruthy();
	});

	it("requires an attribute key for governed deal-attribute cuts", () => {
		const result = dashboardDefinitionSpec.safeParse({
			metric: "breakdown",
			population: "deals",
			groupBy: ["dealAttribute"],
		});
		expect(result.success).toBe(false);
	});

	it("requires explicit confirmation before an API publish", () => {
		expect(
			dashboardDefinitionPublishInput.safeParse({ id: "dashboard-1" }).success,
		).toBe(false);
		expect(
			dashboardDefinitionPublishInput.parse({
				id: "dashboard-1",
				confirmed: true,
			}),
		).toEqual({ id: "dashboard-1", confirmed: true });
	});

	it("maps only supported analytics dimensions to the query contract", () => {
		const spec = dashboardDefinitionSpec.parse({
			metric: "conversionRate",
			population: "deals",
			groupBy: ["pipeline", "owner"],
		});
		expect(analyticsInputForDefinition(spec)).toMatchObject({
			scope: "everyone",
			dimensions: ["owner"],
		});
	});

	it("keeps ChartCDN JSON serializable while honoring visualization options", () => {
		const spec = dashboardDefinitionSpec.parse({
			metric: "conversionRate",
			population: "deals",
			visualization: "line",
			options: { spanGaps: true },
		});
		const result = renderDefinition(
			{
				id: "dashboard-1",
				key: "conversion-rate",
				version: 2,
				status: "PUBLISHED",
			},
			spec,
			{
				window: {
					from: "2026-01-01T00:00:00.000Z",
					to: "2026-02-01T00:00:00.000Z",
				},
				dealCount: 1,
				comparison: { requested: "none", supported: true },
				views: [
					{
						key: "timeSeries",
						title: "Conversion over time",
						description: "Time series",
						chart: {
							type: "line",
							data: {
								labels: ["2026-01"],
								datasets: [{ label: "Conversion", data: [1] }],
							},
						},
						rows: [
							{ period: "2026-01", created: 1, won: 1, conversionRate: 1 },
						],
					},
				],
				attribution: [],
			},
		);
		expect(result.chart.type).toBe("line");
		expect(result.chart.options).toMatchObject({ spanGaps: true });
		expect(JSON.stringify(result)).not.toContain("undefined");
	});

	it("renders stage time from elapsed-day rows instead of conversion rates", () => {
		const spec = dashboardDefinitionSpec.parse({
			metric: "stageTime",
			population: "deals",
			visualization: "bar",
		});
		const result = renderDefinition(
			{
				id: "dashboard-2",
				key: "stage-times",
				version: 1,
				status: "PUBLISHED",
			},
			spec,
			{
				window: {
					from: "2026-01-01T00:00:00.000Z",
					to: "2026-02-01T00:00:00.000Z",
				},
				dealCount: 2,
				comparison: { requested: "none", supported: true },
				views: [
					{
						key: "stagePerformance",
						title: "Stage performance",
						description: "Stages",
						chart: {
							type: "bar",
							data: {
								labels: ["Discovery → Qualified"],
								datasets: [{ label: "Rate", data: [0.5] }],
							},
						},
						rows: [
							{
								fromStage: "Discovery",
								toStage: "Qualified",
								conversionRate: 0.5,
								avgDays: 4.25,
							},
						],
					},
				],
				attribution: [],
			},
		);
		expect(result.chart.data.datasets[0]?.data).toEqual([4.25]);
		expect(result.chart.data.datasets[0]?.label).toBe(
			"Average days between stages",
		);
	});
});
