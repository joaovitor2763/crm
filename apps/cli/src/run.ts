import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CliInvocation } from "./arguments";
import { resolveConfig } from "./config";
import { requestJson } from "./http";
import { withMcpClient } from "./mcp";

export async function run(invocation: CliInvocation): Promise<unknown> {
	const config = resolveConfig(invocation.options);
	const [group, action, subject] = invocation.command;
	if (group === "health" && !action) return requestJson(config, "/health");
	if (group === "contacts" && action === "upsert" && !subject) {
		return requestJson(config, "/api/v1/leads", {
			method: "POST",
			body: JSON.stringify(requireObjectData(invocation.data)),
		});
	}
	if (group === "contacts" && action === "get" && subject) {
		return requestJson(
			config,
			`/api/v1/contacts/${encodeURIComponent(subject)}`,
		);
	}
	if (group === "contacts" && action === "update" && subject) {
		return requestJson(
			config,
			`/api/v1/contacts/${encodeURIComponent(subject)}`,
			{
				method: "PATCH",
				body: JSON.stringify(requireObjectData(invocation.data)),
			},
		);
	}
	if (group === "contacts" && action === "search" && !subject) {
		const data = requireObjectData(invocation.data);
		const query = new URLSearchParams();
		if (typeof data.email === "string") query.set("email", data.email);
		if (typeof data.limit === "number") query.set("limit", String(data.limit));
		return requestJson(config, `/api/v1/contacts?${query}`);
	}
	if (group === "mcp" && action === "list" && !subject) {
		return withMcpClient(config, async (client) => client.listTools());
	}
	if (group === "mcp" && action === "call" && subject) {
		return withMcpClient(config, (client: Client) =>
			client.callTool({
				name: subject,
				arguments: requireObjectData(invocation.data),
			}),
		);
	}
	throw new Error(helpText());
}

function requireObjectData(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("This command requires --data with a JSON object.");
	}
	return value as Record<string, unknown>;
}

export function helpText(): string {
	return [
		"Usage: crm <command> [--data JSON] [--json]",
		"",
		"Commands:",
		"  health",
		"  contacts upsert --data JSON",
		"  contacts get <id>",
		"  contacts update <id> --data JSON",
		'  contacts search --data \'{"email":"person@example.com"}\'',
		"  mcp list",
		"  mcp call <tool> --data JSON",
		"",
		"Connection: --api-url, --api-key and --timeout; env: CRM_API_URL, CRM_API_KEY.",
	].join("\n");
}
