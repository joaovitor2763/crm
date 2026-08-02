import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CliConfig } from "./config";
import { requireApiKey } from "./config";

export async function withMcpClient<T>(
	config: CliConfig,
	operation: (client: Client) => Promise<T>,
): Promise<T> {
	const client = new Client({ name: "crm-cli", version: "0.1.0" });
	const transport = new StreamableHTTPClientTransport(
		new URL("/mcp", config.apiUrl),
		{
			requestInit: {
				headers: { authorization: `Bearer ${requireApiKey(config)}` },
				signal: AbortSignal.timeout(config.timeoutMs),
			},
		},
	);
	try {
		await client.connect(transport);
		return await operation(client);
	} finally {
		await client.close();
	}
}
