import { describe, expect, it } from "bun:test";
import { publicContactUpdateInput } from "../src/public-api/public-api.contracts";

describe("public contact updates", () => {
	it("accepts a bounded partial update", () => {
		expect(
			publicContactUpdateInput.parse({
				title: "Sales Director",
				phone: "+55 11 0000-0000",
			}),
		).toEqual({ title: "Sales Director", phone: "+55 11 0000-0000" });
	});

	it("rejects an empty update", () => {
		expect(publicContactUpdateInput.safeParse({}).success).toBe(false);
	});

	it("rejects unsupported fields and invalid email addresses", () => {
		expect(
			publicContactUpdateInput.safeParse({ summary: "Do not overwrite" })
				.success,
		).toBe(false);
		expect(
			publicContactUpdateInput.safeParse({ email: "not-an-email" }).success,
		).toBe(false);
	});
});
