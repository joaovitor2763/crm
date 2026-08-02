import { describe, expect, it } from "bun:test";
import { sensitiveWrite } from "../agent/lib/approval";
import { capabilitiesMarkdown } from "../agent/lib/capabilities";
import { mergeValues } from "../agent/lib/revenue-account-merge";
import { combinedConfidence } from "../agent/lib/revenue-accounts";

describe("RevenueAccount agent behavior", () => {
	it("merges scalar and list fields only through explicit policies", () => {
		const result = mergeValues(
			{ industry: "software", tags: ["crm"] },
			{ industry: "security", tags: ["crm", "ai"], region: "BR" },
			{ industry: "SOURCE", tags: "UNION" },
		);

		expect(result).toEqual({
			industry: "security",
			tags: ["crm", "ai"],
			region: "BR",
		});
	});

	it("derives confidence from evidence rather than accepting a model score", () => {
		const confidence = combinedConfidence([
			{ signal: "exact-domain", detail: "same domain", weight: 0.75 },
			{ signal: "shared-company", detail: "same company", weight: 0.2 },
		]);

		expect(confidence).toBeCloseTo(0.8);
		expect(confidence).toBeLessThan(0.99);
	});

	it("describes Conta and its human approval boundary in the preamble capabilities", () => {
		const markdown = capabilitiesMarkdown();

		expect(markdown).toContain("Commercial Conta (RevenueAccount)");
		expect(markdown).toContain("operationId");
		expect(markdown).toContain("human approval");
	});

	it("denies scheduled merge approval instead of waiting forever", async () => {
		const approval = sensitiveWrite("exact ids are required")({
			session: {
				auth: {
					current: {
						authenticator: "app",
						principalId: "eve:app",
						principalType: "runtime",
					},
				},
			},
		} as never);

		expect(approval).toEqual({
			type: "denied",
			reason: "Not something to do unattended. exact ids are required",
		});
	});
});
