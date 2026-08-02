import type { CliConfig } from "./config";
import { requireApiKey } from "./config";

export async function requestJson(
	config: CliConfig,
	path: string,
	init: RequestInit = {},
): Promise<unknown> {
	const headers = new Headers(init.headers);
	headers.set("accept", "application/json");
	if (init.body) headers.set("content-type", "application/json");
	if (path !== "/health") {
		headers.set("authorization", `Bearer ${requireApiKey(config)}`);
	}
	const response = await fetch(new URL(path, config.apiUrl), {
		...init,
		headers,
		signal: AbortSignal.timeout(config.timeoutMs),
	});
	const text = await response.text();
	const value = parseResponse(text);
	if (!response.ok) {
		throw new Error(
			`CRM request failed: ${errorDetail(value) ?? `${response.status} ${response.statusText}`}`,
		);
	}
	return value;
}

function parseResponse(text: string): unknown {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function errorDetail(value: unknown): string | undefined {
	if (typeof value === "string") return value.slice(0, 300);
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	for (const key of ["message", "error"]) {
		if (typeof record[key] === "string") return record[key].slice(0, 300);
	}
	return undefined;
}
