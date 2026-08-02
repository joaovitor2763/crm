import type { CliOptions } from "./arguments";

export type CliConfig = {
	apiUrl: URL;
	apiKey?: string;
	timeoutMs: number;
	json: boolean;
};

export function resolveConfig(options: CliOptions): CliConfig {
	const rawUrl =
		options.apiUrl ?? process.env.CRM_API_URL ?? process.env.API_URL;
	if (!rawUrl) {
		throw new Error(
			"Set CRM_API_URL (or pass --api-url) before using the CLI.",
		);
	}
	let apiUrl: URL;
	try {
		apiUrl = new URL(rawUrl);
	} catch {
		throw new Error("CRM_API_URL must be an absolute HTTP(S) URL.");
	}
	if (!new Set(["http:", "https:"]).has(apiUrl.protocol)) {
		throw new Error("CRM_API_URL must use HTTP or HTTPS.");
	}
	return {
		apiUrl,
		apiKey: options.apiKey ?? process.env.CRM_API_KEY,
		timeoutMs: options.timeoutMs ?? 15_000,
		json: options.json,
	};
}

export function requireApiKey(config: CliConfig): string {
	if (!config.apiKey) {
		throw new Error("Set CRM_API_KEY (or pass --api-key) for this command.");
	}
	return config.apiKey;
}
