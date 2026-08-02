import "@crm/env/load";

/**
 * What this install can actually do.
 *
 * Every outside source the agent can reach is optional, and most self-hosted
 * copies of this repo will have none of them. That has to be an ordinary
 * operating condition rather than a degraded one, because the best evidence
 * here was never bought: a reply from someone's own address, their signature
 * block, a meeting they turned up to. `read_crm_history` needs no key at all
 * and beats every vendor in this list.
 *
 * So a missing key is not an error anywhere. It removes a place to look, the
 * agent is told which places it has before it plans, and the tools that need
 * one say so plainly and cost nothing. The failure this design exists to
 * prevent is an agent that burns its budget rediscovering that a key is
 * absent, then writes a confident summary from the little it managed to read.
 */

export type Capability = {
	/** The variable to set to turn it on. */
	readonly env: string;
	readonly label: string;
	/** What it adds, in the agent's terms. */
	readonly gives: string;
	readonly enabled: boolean;
};

/**
 * Read on every call rather than captured at import.
 *
 * These are cheap, and a value that was snapshotted at module load is a value
 * that lies in tests and in any process that configures itself late.
 */
export function capabilities(): readonly Capability[] {
	const set = (key: string) => Boolean(process.env[key]?.trim());

	return [
		{
			env: "RAPIDAPI_KEY",
			label: "LinkedIn",
			gives:
				"a person's real name, current title, employer and tenure, self-reported, and so authoritative on identity",
			enabled: set("RAPIDAPI_KEY"),
		},
		{
			env: "PERPLEXITY_API_KEY",
			label: "Web research",
			gives:
				"open-web context with citations, and the search that finds a LinkedIn slug in the first place",
			enabled: set("PERPLEXITY_API_KEY"),
		},
		{
			env: "CONTEXT_DEV_API_KEY",
			label: "Company brand data",
			gives: "a company's logo, industry, location and socials from its domain",
			enabled: set("CONTEXT_DEV_API_KEY"),
		},
	];
}

/** Whether one source is available, by its variable name. */
export function enabled(env: string): boolean {
	return capabilities().some(
		(capability) => capability.env === env && capability.enabled,
	);
}

/**
 * The result a tool returns when its source is not configured.
 *
 * Deliberately shaped like every other "we could not find out" answer, and
 * deliberately explicit that retrying is pointless — an agent told only
 * "failed" will reasonably try again, and there is nothing on the other end.
 */
export function unavailable(env: string): {
	ok: false;
	configured: false;
	reason: string;
} {
	return {
		ok: false,
		configured: false,
		reason:
			`This install has no ${env}, so that source is unavailable. This is not a failure and retrying will not help — ` +
			"use what the CRM already knows, and say in your write-up what you could not check.",
	};
}

/**
 * The capability list, as a section for the session instructions.
 *
 * Both halves are stated. An agent told only what it has will keep proposing
 * the tool it does not, and one told only what it lacks reads it as a fault to
 * work around.
 */
export function capabilitiesMarkdown(): string {
	const all = capabilities();
	const on = all.filter((capability) => capability.enabled);
	const off = all.filter((capability) => !capability.enabled);

	const lines = ["## What you can use here", ""];

	if (on.length === 0) {
		lines.push(
			"No outside sources are configured on this install. Everything you can",
			"learn is already in the CRM — email threads, meetings, signature",
			"blocks — and `read_crm_history` reads all of it for free. That is",
			"often enough to settle who somebody is. Record what it shows, and",
			"leave the rest empty.",
		);
	} else {
		lines.push("Available:");
		for (const capability of on) {
			lines.push(`- **${capability.label}** — ${capability.gives}.`);
		}

		if (off.length > 0) {
			lines.push("", "Not configured here, so do not plan around them:");
			for (const capability of off) {
				lines.push(`- ${capability.label}`);
			}
			lines.push(
				"",
				"Their tools will tell you the same thing if you call them. Note what",
				"you could not check rather than guessing at it.",
			);
		}
	}

	lines.push(
		"",
		"## Commercial Conta (RevenueAccount)",
		"",
		"Conta is the commercial RevenueAccount entity; it is separate from the Better Auth Account used for OAuth credentials.",
		"Use `search_revenue_accounts` and then exact ids with `read_revenue_account`. The read includes scoped neighboring contacts, companies, deals, attribute history and lineage grouped by operationId.",
		"`read_attribution_lineage` reads first/current touch, recurring sources, pipeline entries and immutable events for Contacts, Companies, Deals and Contas; after a merge it follows aliases without changing source entity ids.",
		"`read_revenue_analytics` and `read_dashboard_definitions` are read-only views of scoped funnel metrics and governed ChartCDN dashboard specs. Global administrators can inspect ontology snapshots with the ontology read tools; publication remains a Studio action with explicit confirmation.",
		"`suggest_revenue_account_duplicates` derives evidence and confidence from CRM observations only. `preview_revenue_account_merge` is read-only. `merge_revenue_accounts` requires exact source and target ids, explicit per-field policies and a human approval; ambiguous or scheduled merges must never run.",
	);
	return lines.join("\n");
}
