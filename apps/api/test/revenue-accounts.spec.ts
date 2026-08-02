import { describe, expect, it } from "bun:test";
import {
	accountAttributes,
	changedKeys,
	mergeValues,
	normalizeMatch,
	splitAccountAttributes,
} from "../src/revenue-accounts/revenue-accounts.helpers";

describe("RevenueAccount core policies", () => {
	it("normalizes duplicate candidates without changing stored values", () => {
		expect(normalizeMatch("  Acme   Holdings ")).toBe("acme holdings");
	});

	it("requires an explicit policy for conflicting attributes", () => {
		expect(mergeValues({ tier: "A" }, { tier: "B" }, {})).toEqual({
			values: { tier: "A" },
			conflicts: ["tier"],
		});
	});

	it("unions list attributes while preserving the target scalar", () => {
		expect(
			mergeValues(
				{ tags: ["vip"], owner: "target" },
				{ tags: ["partner", "vip"], owner: "source" },
				{ tags: "UNION", owner: "TARGET" },
			),
		).toEqual({
			values: { tags: ["vip", "partner"], owner: "target" },
			conflicts: [],
		});
	});

	it("records scalar and list changes as one operation's field set", () => {
		expect(
			changedKeys({ score: 1, tags: ["a"] }, { score: 2, tags: ["a", "b"] }),
		).toEqual(["score", "tags"]);
	});

	it("round-trips system and custom attributes for merge lineage", () => {
		const values = accountAttributes({
			name: "Conta",
			domain: "example.test",
			businessUnitId: "unit-1",
			teamId: null,
			ownerId: "owner-1",
			customValues: { tags: ["customer", "priority"] },
		});
		expect(splitAccountAttributes(values)).toEqual({
			system: {
				name: "Conta",
				domain: "example.test",
				businessUnitId: "unit-1",
				teamId: null,
				ownerId: "owner-1",
			},
			customValues: { tags: ["customer", "priority"] },
		});
	});
});
