import { describe, expect, it } from "bun:test";
import {
	DEFAULT_DASHBOARD_SPEC,
	dashboardDraft,
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
});
