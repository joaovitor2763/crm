#!/usr/bin/env bun

import { CrmClient } from "./client";
import { printError, printResult } from "./output";
import {
	booleanOption,
	CliUsageError,
	jsonOption,
	option,
	parseArgs,
	requiredOption,
} from "./parser";

export async function run(
	argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
	const parsed = parseArgs(argv);
	const human = booleanOption(parsed.options, "human");
	if (
		booleanOption(parsed.options, "help") ||
		booleanOption(parsed.options, "h")
	) {
		printResult({ usage: usage() }, human);
		return;
	}
	const client = new CrmClient({
		baseUrl: option(parsed.options, "base-url"),
		token: option(parsed.options, "token"),
		timeoutMs: numberOption(parsed.options, "timeout-ms", 15_000),
	});
	const [resource, action, ...rest] = parsed.command;
	const result = await dispatch(client, resource, action, rest, parsed.options);
	printResult(result, human);
}

async function dispatch(
	client: CrmClient,
	resource: string | undefined,
	action: string | undefined,
	args: string[],
	options: Record<string, string | true>,
): Promise<unknown> {
	if (resource === "health") return client.health();
	if (resource === "lead" && action === "upsert")
		return client.upsertLead(leadPayload(options));
	if (resource === "contact" && action === "get")
		return client.getContact(requiredPositional(args, "contact id"));
	if (resource === "contact" && action === "list") {
		return client.listContacts({
			email: option(options, "email"),
			limit: numberOption(options, "limit"),
		});
	}
	if (resource === "mcp" && action === "tools") return client.mcp("tools/list");
	if (resource === "mcp" && action === "call") {
		const name = requiredPositional(args, "tool name");
		return client.mcp("tools/call", {
			name,
			arguments: jsonOption(options, "args", {}),
		});
	}
	throw new CliUsageError(usage());
}

function leadPayload(
	options: Record<string, string | true>,
): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		source: requiredOption(options, "source"),
		businessUnitId: requiredOption(options, "business-unit-id"),
		firstName: requiredOption(options, "first-name"),
		customValues: jsonOption(options, "custom-values", {}),
	};
	for (const [flag, key] of [
		["external-id", "externalId"],
		["idempotency-key", "idempotencyKey"],
		["last-name", "lastName"],
		["email", "email"],
		["phone", "phone"],
		["title", "title"],
		["company-id", "companyId"],
		["team-id", "teamId"],
		["owner-id", "ownerId"],
		["utm-source", "utmSource"],
		["utm-medium", "utmMedium"],
		["utm-campaign", "utmCampaign"],
		["utm-term", "utmTerm"],
		["utm-content", "utmContent"],
	] as const) {
		const value = option(options, flag);
		if (value !== undefined) payload[key] = value;
	}
	if (!payload.email && !payload.phone) {
		throw new CliUsageError("Lead needs --email or --phone.");
	}
	return payload;
}

function requiredPositional(args: string[], name: string): string {
	const value = args[0];
	if (!value) throw new CliUsageError(`${name} is required.`);
	return value;
}

function numberOption(
	options: Record<string, string | true>,
	name: string,
	defaultValue?: number,
): number | undefined {
	const raw = option(options, name);
	if (raw === undefined) return defaultValue;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1)
		throw new CliUsageError(`Option --${name} must be a positive integer.`);
	return value;
}

function usage(): string {
	return [
		"Usage:",
		"  crm health [--base-url URL]",
		"  crm lead upsert --source SOURCE --business-unit-id ID --first-name NAME (--email EMAIL | --phone PHONE)",
		"  crm contact get CONTACT_ID",
		"  crm contact list [--email EMAIL] [--limit N]",
		"  crm mcp tools",
		"  crm mcp call TOOL_NAME [--args JSON]",
	].join("\n");
}

if (import.meta.main) {
	run().catch((error) => {
		const human = process.argv.includes("--human");
		printError(error, human);
		process.exitCode = 1;
	});
}
