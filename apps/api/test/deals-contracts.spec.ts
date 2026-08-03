import { describe, expect, it } from "bun:test";
import { dealListInput } from "../src/deals/deals.contracts";

describe("deal list date filters", () => {
	it("accepts an inclusive single-day window", () => {
		expect(
			dealListInput.parse({ closeFrom: "2026-08-03", closeTo: "2026-08-03" }),
		).toMatchObject({ closeFrom: "2026-08-03", closeTo: "2026-08-03" });
	});

	it("rejects impossible calendar dates", () => {
		expect(() => dealListInput.parse({ closeTo: "2026-02-31" })).toThrow();
	});

	it("rejects a reversed window", () => {
		expect(() =>
			dealListInput.parse({ closeFrom: "2026-08-04", closeTo: "2026-08-03" }),
		).toThrow("Close to cannot be before close from.");
	});
});
