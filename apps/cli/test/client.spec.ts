import { describe, expect, it } from "bun:test";
import {
	CrmClient,
	CrmClientError,
	normalizeBaseUrl,
	parseResponse,
	redactSecrets,
} from "../src/client";

describe("CRM client", () => {
	it("normalizes safe origins and rejects credential-bearing URLs", () => {
		expect(normalizeBaseUrl("https://crm.example.test/")).toBe(
			"https://crm.example.test",
		);
		expect(() =>
			normalizeBaseUrl("https://user:pass@crm.example.test"),
		).toThrow(CrmClientError);
	});

	it("sends a lead without exposing the bearer token in its request body", async () => {
		let request: Request | undefined;
		const client = new CrmClient({
			baseUrl: "https://crm.example.test",
			token: "secret-token",
			fetcher: async (input, init) => {
				request = new Request(input, init);
				return new Response('{"status":"ACCEPTED"}', { status: 200 });
			},
		});
		expect(
			await client.upsertLead({ firstName: "Ada", email: "ada@example.test" }),
		).toEqual({ status: "ACCEPTED" });
		expect(request?.headers.get("authorization")).toBe("Bearer secret-token");
		expect(await request?.text()).toBe(
			'{"firstName":"Ada","email":"ada@example.test"}',
		);
	});

	it("reads MCP streamable HTTP event responses", () => {
		expect(
			parseResponse(
				'event: message\ndata: {"result":{"tools":[]}}\n\n',
				"text/event-stream",
			),
		).toEqual({ result: { tools: [] } });
	});

	it("redacts bearer tokens from upstream error messages", () => {
		expect(redactSecrets("invalid Bearer secret-token", "secret-token")).toBe(
			"invalid Bearer [redacted]",
		);
	});

	it("calls MCP with a protocol version and returns its result", async () => {
		let request: Request | undefined;
		const client = new CrmClient({
			baseUrl: "https://crm.example.test",
			token: "secret-token",
			fetcher: async (input, init) => {
				request = new Request(input, init);
				return new Response('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}', {
					status: 200,
				});
			},
		});
		expect(await client.mcp("tools/list")).toEqual({ tools: [] });
		expect(request?.headers.get("mcp-protocol-version")).toBe("2025-03-26");
	});
});
