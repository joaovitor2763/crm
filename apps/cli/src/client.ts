export type ClientOptions = {
	baseUrl?: string;
	token?: string;
	timeoutMs?: number;
	fetcher?: Fetcher;
};

export type Fetcher = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export class CrmClientError extends Error {
	readonly code: string;
	readonly status?: number;

	constructor(message: string, code = "REQUEST_FAILED", status?: number) {
		super(message);
		this.name = "CrmClientError";
		this.code = code;
		this.status = status;
	}
}

export type McpResponse = {
	result?: Record<string, unknown>;
	error?: { code?: number; message?: string };
};

export class CrmClient {
	private readonly baseUrl: string;
	private readonly token?: string;
	private readonly timeoutMs: number;
	private readonly fetcher: Fetcher;

	constructor(options: ClientOptions = {}) {
		const rawBaseUrl =
			options.baseUrl ?? process.env.CRM_API_URL ?? "http://localhost:3001";
		this.baseUrl = normalizeBaseUrl(rawBaseUrl);
		this.token = options.token ?? process.env.CRM_API_TOKEN;
		this.timeoutMs = options.timeoutMs ?? 15_000;
		this.fetcher = options.fetcher ?? fetch;
	}

	async health(): Promise<unknown> {
		return this.request("/health", { method: "GET", auth: false });
	}

	async upsertLead(payload: Record<string, unknown>): Promise<unknown> {
		return this.request("/api/v1/leads", {
			method: "POST",
			body: payload,
		});
	}

	async getContact(id: string): Promise<unknown> {
		return this.request(`/api/v1/contacts/${encodeURIComponent(id)}`, {
			method: "GET",
		});
	}

	async listContacts(
		params: { email?: string; limit?: number } = {},
	): Promise<unknown> {
		const query = new URLSearchParams();
		if (params.email) query.set("email", params.email);
		if (params.limit !== undefined) query.set("limit", String(params.limit));
		const suffix = query.size ? `?${query.toString()}` : "";
		return this.request(`/api/v1/contacts${suffix}`, { method: "GET" });
	}

	async mcp<T extends Record<string, unknown> = Record<string, unknown>>(
		method: string,
		params: T = {} as T,
	): Promise<Record<string, unknown>> {
		const response = await this.request("/mcp", {
			method: "POST",
			body: { jsonrpc: "2.0", id: Date.now(), method, params },
			mcp: true,
		});
		const payload = response as McpResponse;
		if (payload.error) {
			throw new CrmClientError(
				redactSecrets(
					payload.error.message ?? "MCP request failed.",
					this.token,
				),
				"MCP_ERROR",
			);
		}
		return payload.result ?? {};
	}

	private async request(
		path: string,
		options: {
			method: "GET" | "POST";
			body?: unknown;
			auth?: boolean;
			mcp?: boolean;
		},
	): Promise<unknown> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		const headers = new Headers({
			accept: options.mcp
				? "application/json, text/event-stream"
				: "application/json",
		});
		if (options.body !== undefined)
			headers.set("content-type", "application/json");
		if (this.token && options.auth !== false)
			headers.set("authorization", `Bearer ${this.token}`);
		if (options.mcp) headers.set("mcp-protocol-version", "2025-03-26");

		try {
			const response = await this.fetcher(`${this.baseUrl}${path}`, {
				method: options.method,
				headers,
				body:
					options.body === undefined ? undefined : JSON.stringify(options.body),
				signal: controller.signal,
			});
			const text = await response.text();
			const parsed = parseResponse(text, response.headers.get("content-type"));
			if (!response.ok) {
				throw new CrmClientError(
					errorMessage(parsed, response.status, this.token),
					"HTTP_ERROR",
					response.status,
				);
			}
			return parsed;
		} catch (error) {
			if (error instanceof CrmClientError) throw error;
			if (error instanceof Error && error.name === "AbortError") {
				throw new CrmClientError("Request timed out.", "TIMEOUT");
			}
			throw new CrmClientError("Unable to reach the CRM API.", "NETWORK_ERROR");
		} finally {
			clearTimeout(timer);
		}
	}
}

export function normalizeBaseUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new CrmClientError(
			"CRM_API_URL must be a valid HTTP(S) URL.",
			"CONFIG_ERROR",
		);
	}
	if (
		!/^https?:$/.test(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new CrmClientError(
			"CRM_API_URL must be an origin without credentials or query parameters.",
			"CONFIG_ERROR",
		);
	}
	return url.toString().replace(/\/$/, "");
}

export function parseResponse(
	text: string,
	contentType: string | null,
): unknown {
	if (!text.trim()) return null;
	if (contentType?.includes("text/event-stream")) {
		const data = text
			.split(/\r?\n/)
			.filter((line) => line.startsWith("data: "))
			.map((line) => line.slice(6).trim())
			.filter(Boolean)
			.at(-1);
		if (!data)
			throw new CrmClientError(
				"The MCP response did not contain data.",
				"MCP_PROTOCOL_ERROR",
			);
		return parseJson(data);
	}
	return parseJson(text);
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return { text };
	}
}

function errorMessage(value: unknown, status: number, token?: string): string {
	if (
		typeof value === "object" &&
		value !== null &&
		"message" in value &&
		typeof value.message === "string"
	) {
		return redactSecrets(value.message, token);
	}
	return `CRM API request failed with HTTP ${status}.`;
}

export function redactSecrets(message: string, token?: string): string {
	const withToken = token ? message.split(token).join("[redacted]") : message;
	return withToken.replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]");
}
