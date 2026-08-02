import { describe, expect, it } from "bun:test";
import { dealStageLabel } from "@/components/crm/deal-stage";

describe("dealStageLabel", () => {
	it("keeps legacy timeline stage tokens human-readable", () => {
		expect(dealStageLabel("DEMO_BOOKED")).toBe("Demo booked");
		expect(dealStageLabel("CLOSED_LOST")).toBe("Closed lost");
		expect(dealStageLabel("DECISION_MAKER_BOUGHT_IN")).toBe(
			"Decision maker in",
		);
		expect(dealStageLabel("UNQUALIFIED_TO_BUY")).toBe("Unqualified");
	});

	it("leaves configurable stage names unchanged", () => {
		expect(dealStageLabel("Security review")).toBe("Security review");
	});
});
