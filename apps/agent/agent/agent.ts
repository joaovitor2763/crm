import "@crm/env/load";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type AgentDefinition, defineAgent } from "eve";
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

const model =
	process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash-0731";

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
	model: openrouter(model),
	modelContextWindowTokens: 1_048_576,
}) as AgentDefinition;
