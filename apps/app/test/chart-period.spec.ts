import { describe, expect, test } from "bun:test";
import { formatChartPeriod } from "../lib/chart-period";

describe("chart period labels", () => {
	test("removes the verbose weekly prefix and ISO date", () => {
		const label = formatChartPeriod("Week of 2026-08-03", "week");
		expect(label).not.toContain("Week of");
		expect(label).not.toContain("2026-08-03");
	});

	test("keeps months and quarters compact but unambiguous", () => {
		expect(formatChartPeriod("2026-08", "month")).not.toBe("2026-08");
		expect(formatChartPeriod("2026 Q3", "quarter")).toBe("Q3 ’26");
	});

	test("preserves an unknown value instead of inventing a date", () => {
		expect(formatChartPeriod("not-a-period", "day")).toBe("not-a-period");
	});
});
