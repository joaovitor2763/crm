import { afterEach, describe, expect, it, mock } from "bun:test";
import { requestJson } from "../src/http";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("CLI HTTP client", () => {
	it("authenticates CRM requests and parses JSON", async () => {
		globalThis.fetch = mock(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(new Headers(init?.headers).get("authorization")).toBe(
					"Bearer test-key",
				);
				return Response.json({ status: "ok" });
			},
		) as unknown as typeof fetch;
		await expect(
			requestJson(
				{
					apiUrl: new URL("https://crm.example"),
					apiKey: "test-key",
					timeoutMs: 1_000,
					json: true,
				},
				"/api/v1/contacts",
			),
		).resolves.toEqual({ status: "ok" });
	});

	it("does not add credentials to the public health request", async () => {
		globalThis.fetch = mock(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				expect(new Headers(init?.headers).has("authorization")).toBe(false);
				return Response.json({ status: "ok" });
			},
		) as unknown as typeof fetch;
		await requestJson(
			{ apiUrl: new URL("https://crm.example"), timeoutMs: 1_000, json: false },
			"/health",
		);
	});

	it("returns a bounded API error without request credentials", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ message: "Not allowed" }, { status: 403 }),
		) as unknown as typeof fetch;
		await expect(
			requestJson(
				{
					apiUrl: new URL("https://crm.example"),
					apiKey: "never-print-this",
					timeoutMs: 1_000,
					json: false,
				},
				"/api/v1/contacts",
			),
		).rejects.toThrow("CRM request failed: Not allowed");
	});
});
