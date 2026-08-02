import { describe, expect, it } from "bun:test";
import {
	DEFAULT_DASHBOARD_SPEC,
	dashboardDraft,
	definitionDraft,
	latestDefinitions,
	templateDraft,
	withAttributeFilter,
	withDimension,
} from "@/app/(app)/studio/studio-dashboard-definition-data";

describe("Studio dashboard definition data", () => {
	it("keeps the contract defaults visible to a new editor", () => {
		const draft = dashboardDraft();

		expect(draft.spec).toMatchObject({
			metric: DEFAULT_DASHBOARD_SPEC.metric,
			population: DEFAULT_DASHBOARD_SPEC.population,
			groupBy: ["pipeline", "stage"],
			breakdowns: [],
			timeRange: { grain: "month", timezone: "UTC" },
			comparison: "none",
			visualization: "bar",
		});
	});

	it("adds a separate breakdown without mutating groupBy", () => {
		const next = withDimension(DEFAULT_DASHBOARD_SPEC, "channel");

		expect(next.groupBy).toContain("channel");
		expect(next.breakdowns).toEqual([]);
		expect(DEFAULT_DASHBOARD_SPEC.groupBy).toEqual(["pipeline", "stage"]);
	});

	it("replaces the governed attribute filter", () => {
		const first = withAttributeFilter(DEFAULT_DASHBOARD_SPEC, "segment");
		const second = withAttributeFilter(first, "region");

		expect(second.filters).toEqual([
			{ key: "attributeKey", operator: "eq", value: "region" },
		]);
	});

	it("keeps only the latest version for each definition key", () => {
		const rows = latestDefinitions([
			{
				id: "old",
				key: "conversion",
				name: "Old",
				description: null,
				version: 1,
				status: "ARCHIVED",
				spec: {},
			},
			{
				id: "new",
				key: "conversion",
				name: "New",
				description: null,
				version: 2,
				status: "PUBLISHED",
				spec: {},
			},
			{
				id: "pipeline",
				key: "pipeline",
				name: "Pipeline",
				description: null,
				version: 1,
				status: "DRAFT",
				spec: {},
			},
		]);

		expect(rows.map((row) => row.id)).toEqual(["new", "pipeline"]);
	});

	it("normalizes template and definition data into editor drafts", () => {
		expect(
			templateDraft({
				key: "template",
				name: "Template",
				description: "Reusable",
				spec: { metric: "conversionTime" },
			}),
		).toMatchObject({
			key: "template",
			name: "Template",
			description: "Reusable",
			spec: { metric: "conversionTime" },
		});
		expect(
			definitionDraft({
				id: "definition",
				key: "definition",
				name: "Definition",
				description: null,
				version: 1,
				status: "DRAFT",
				spec: { metric: "stageRate" },
			}),
		).toMatchObject({
			key: "definition",
			description: "",
			spec: { metric: "stageRate" },
		});
	});
});
