import { describe, expect, it } from "bun:test";
import { parseArguments } from "../src/arguments";
import { resolveConfig } from "../src/config";

describe("CLI arguments", () => {
	it("keeps commands separate from connection flags", () => {
		expect(
			parseArguments([
				"mcp",
				"call",
				"submit_lead",
				"--api-url",
				"https://crm.example",
				"--data",
				'{"email":"person@example.com"}',
				"--json",
			]),
		).toEqual({
			command: ["mcp", "call", "submit_lead"],
			data: { email: "person@example.com" },
			options: { apiUrl: "https://crm.example", json: true },
		});
	});

	it("rejects invalid JSON and timeouts", () => {
		expect(() => parseArguments(["health", "--data", "{"])).toThrow(
			"valid JSON",
		);
		expect(() => parseArguments(["health", "--timeout", "10"])).toThrow(
			"at least 100ms",
		);
	});

	it("validates the configured URL", () => {
		expect(() =>
			resolveConfig({
				apiUrl: "file:///tmp/crm",
				apiKey: "secret",
				json: false,
			}),
		).toThrow("HTTP or HTTPS");
	});
});
