import { describe, expect, test } from "bun:test";
import { businessObjectLabel } from "../lib/business-object-label";

describe("business object labels", () => {
	test("normalizes legacy labels for system objects", () => {
		expect(
			businessObjectLabel({
				key: "revenue-accounts",
				name: "Conta",
				pluralName: "Contas",
			}),
		).toBe("Revenue accounts");
	});

	test("keeps workspace-authored labels for custom objects", () => {
		expect(
			businessObjectLabel({
				key: "implementation-partners",
				name: "Implementation partner",
				pluralName: "Implementation partners",
			}),
		).toBe("Implementation partners");
	});
});
