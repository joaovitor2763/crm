import "@crm/env/load";

import { db, decryptSecret } from "@crm/db";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type AgentDefinition, defineAgent, defineDynamic } from "eve";
import { capabilities } from "./lib/capabilities";

/**
 * The people-research agent.
 *
 * OpenRouter is configured directly as an AI SDK provider so this deployment
 * uses the install owner's OpenRouter balance rather than Vercel AI Gateway.
 * The model remains environment-selectable, with DeepSeek V4 Flash 0731 as the
 * tested default for fast, inexpensive tool-using work.
 */
const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
});

const model = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash-0731";
const fallbackContextWindow = 1_048_576;
const unknownModelContextWindow = 32_768;
const environmentValue = process.env.OPENROUTER_API_KEY ?? "";
const providerCredentialOption = "apiKey" as const;

let cachedConfiguration:
	| {
			expiresAt: number;
			runtimeValue: string;
			defaults: Record<string, string>;
			approvedModels: string[];
			contextWindows: Record<string, number>;
	  }
	| undefined;

async function runtimeModel(taskKind: string | undefined) {
	if (!cachedConfiguration || cachedConfiguration.expiresAt < Date.now()) {
		const row = await db.aiProviderConfiguration.findUnique({
			where: { provider: "openrouter" },
		});
		const cipherMaterial = process.env.AI_CONFIG_ENCRYPTION_KEY;
		const storedValue =
			row?.apiKeyEncrypted && cipherMaterial
				? decryptSecret(row.apiKeyEncrypted, cipherMaterial)
				: undefined;
		cachedConfiguration = {
			expiresAt: Date.now() + 60_000,
			runtimeValue: storedValue ?? environmentValue,
			defaults:
				row?.defaults &&
				typeof row.defaults === "object" &&
				!Array.isArray(row.defaults)
					? (row.defaults as Record<string, string>)
					: {},
			approvedModels: row?.models ?? [],
			contextWindows: parseContextWindows(row?.modelContextWindows),
		};
	}
	if (!cachedConfiguration.runtimeValue) return null;
	const workload = taskKind
		? taskKind.includes("enrich")
			? "enrichment"
			: "research"
		: "interactive";
	const configured = cachedConfiguration.defaults[workload];
	const selected =
		configured && cachedConfiguration.approvedModels.includes(configured)
			? configured
			: (cachedConfiguration.approvedModels[0] ?? model);
	return {
		model: createOpenRouter({
			[providerCredentialOption]: cachedConfiguration.runtimeValue,
		})(selected),
		modelContextWindowTokens:
			cachedConfiguration.contextWindows[selected] ??
			(selected === model ? fallbackContextWindow : unknownModelContextWindow),
	};
}

function parseContextWindows(value: unknown): Record<string, number> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter(
			(entry): entry is [string, number] =>
				typeof entry[1] === "number" && Number.isInteger(entry[1]),
		),
	);
}

/**
 * Says which outside sources are on, once, at startup.
 *
 * Every one of them is optional and the agent is designed to run with none, so
 * the thing a self-hoster needs is not a warning — it is a plain statement of
 * what this install can see, printed where they are already looking. Silence
 * would leave "the agent found nothing" and "the agent had nowhere to look"
 * indistinguishable.
 */
for (const capability of capabilities()) {
	console.log(
		`[agent] ${capability.enabled ? "on " : "off"}  ${capability.label} (${capability.env})`,
	);
}

export default defineAgent<AgentDefinition>({
	model: defineDynamic({
		fallback: openrouter(model),
		events: {
			"step.started": async (_event, ctx) => {
				const attributes = ctx.session.auth.current?.attributes as
					| Record<string, unknown>
					| undefined;
				return runtimeModel(
					typeof attributes?.taskKind === "string"
						? attributes.taskKind
						: undefined,
				);
			},
		},
	}),
	modelContextWindowTokens: 1_048_576,
}) as AgentDefinition;
