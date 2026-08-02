import type { EveMessage, EveMessagePart } from "eve/react";

/**
 * The agent's event stream, projected into something a rep can read.
 *
 * Separate from the component because this is the part with opinions in it —
 * which tool call becomes which sentence, what counts as a refusal, which URLs
 * are worth showing — and none of it needs a browser to be wrong. The panel
 * renders what this returns.
 */

/** Something said, or something done. A run is made of both. */
export type TranscriptItem =
	| { kind: "said"; id: string; mine: boolean; text: string }
	| {
			kind: "did";
			id: string;
			label: string;
			tone: Tone;
			pending: boolean;
			sources: Source[];
	  };

export type Tone = "neutral" | "success" | "warning";

export type Source = {
	url: string;
	/** The host, which is the part a rep recognises. */
	title: string;
	network: "linkedin" | "github" | "web";
};

/**
 * Tool slugs are for the model; these lines are for a person.
 *
 * Every tool the agent can call belongs here, **including eve's own built-ins**
 * — those are the ones that get forgotten, because they arrive without anybody
 * adding a file for them, and `load_skill` sat in the middle of a transcript
 * reading exactly like that: a lowercase slug among finished English sentences.
 * `test/agent-transcript.spec.ts` walks `apps/agent/agent/tools` and this list
 * so a new tool cannot ship without a line.
 *
 * Past tense throughout, because a transcript is a record of what happened.
 */
const VERBS: Record<string, string> = {
	read_crm_history: "Read our emails and meetings with them",
	read_company_history: "Read everything we have on the company",
	read_deal_history: "Read the deal and where it has been",
	search_crm: "Looked the record up in the CRM",
	resolve_linkedin_profile: "Searched for their LinkedIn profile",
	get_linkedin_profile: "Read a LinkedIn profile",
	get_contact_work_history: "Read their work history",
	find_contact_socials: "Searched for their other profiles",
	set_contact_socials: "Checked a profile against the account itself",
	identify_contact: "Put a name to the address",
	record_fact: "Recorded what it found",
	write_brief: "Wrote the background",
	research_person: "Researched them on the web",
	research_company: "Read the company's site",
	enrich_company: "Looked up the company",
	schedule_recheck: "Decided when to look again",
	record_job_change: "Raised a job change",
	list_outstanding_work: "Looked for outstanding work",
	read_revenue_account: "Read the revenue account",
	search_revenue_accounts: "Looked for revenue accounts",
	suggest_revenue_account_duplicates: "Suggested possible duplicate accounts",
	preview_revenue_account_merge: "Previewed an account merge",
	merge_revenue_accounts: "Merged revenue accounts",
	read_attribution_lineage: "Read the conversion attribution lineage",
	read_revenue_analytics: "Read the revenue analytics",
	read_dashboard_definitions: "Read the governed dashboard definitions",
	read_ontology_schemas: "Listed the ontology schemas",
	read_ontology_schema: "Read an ontology schema version",
	preview_ontology_impact: "Previewed an ontology change impact",

	// eve's default harness. Named here for the same reason as the rest: a rep
	// reading a run should not have to know which of these we wrote.
	load_skill: "Read its instructions for this",
	web_search: "Searched the web",
	web_fetch: "Read a web page",
	todo: "Updated its plan",
	ask_question: "Asked a question",
	agent: "Handed part of the job to a helper",
	connection_search: "Looked for a tool it could use",
	bash: "Ran a command",
	read_file: "Read a file",
	write_file: "Wrote a file",
	glob: "Looked for files",
	grep: "Searched inside the files",
};

/**
 * The last resort, for a tool nobody has written a line for yet.
 *
 * Sentence case rather than the raw slug: `set_contact_socials` reads as "Set
 * contact socials", which is plain but is at least English. The test makes
 * this unreachable for tools that exist today; it is here for the one somebody
 * adds on a Friday.
 */
function humanise(tool: string): string {
	const words = tool.replace(/_/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One message and everything it produced, in order. */
export type TranscriptMessage = {
	id: string;
	mine: boolean;
	items: TranscriptItem[];
};

/**
 * The stream, grouped by message.
 *
 * Grouped rather than flat because `MessageScrollerItem` is a *row boundary* —
 * the docs' own example is one item per message — and the scroller measures and
 * tracks each one. A separate row per tool call means dozens of boundaries
 * appearing and re-measuring during a single answer, which is visible as
 * flicker.
 *
 * Part ids prefer the tool call id, which is stable across the streaming states
 * of one call. A positional key would move as parts arrive and remount rows
 * mid-answer.
 */
export function toTranscript(
	messages: readonly EveMessage[],
): TranscriptMessage[] {
	return messages
		.map((message) => ({
			id: message.id,
			mine: message.role === "user",
			items: message.parts.flatMap((part, index): TranscriptItem[] => {
				const id = partId(message.id, part, index);

				if (part.type === "text") {
					const text = part.text.trim();
					if (!text) return [];
					return [{ kind: "said", id, mine: message.role === "user", text }];
				}

				if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
					const state = "state" in part ? part.state : undefined;

					return [
						{
							kind: "did",
							id,
							label: describe(part),
							tone: outcomeTone(part),
							pending:
								state === "input-streaming" || state === "input-available",
							sources: sourcesOf(part),
						},
					];
				}

				return [];
			}),
		}))
		.filter((message) => message.items.length > 0);
}

function partId(
	messageId: string,
	part: EveMessagePart,
	index: number,
): string {
	const callId =
		"toolCallId" in part && typeof part.toolCallId === "string"
			? part.toolCallId
			: null;

	return callId ? `${messageId}:${callId}` : `${messageId}:${index}`;
}

export function toolName(part: EveMessagePart): string {
	if (part.type === "dynamic-tool" && "toolName" in part) {
		return String(part.toolName);
	}
	return part.type.replace(/^tool-/, "");
}

/** Exported for the test that pins every tool to a line of English. */
export const TOOL_VERBS = VERBS;

export function describe(part: EveMessagePart): string {
	const tool = toolName(part);
	const verb = VERBS[tool] ?? humanise(tool);
	const reason = output(part)?.reason;

	// The reason a write did not happen is the interesting half.
	return typeof reason === "string" ? `${verb} — ${reason}` : verb;
}

/**
 * How a step reads at a glance.
 *
 * A refusal is a `warning`, never hidden: the agent declining to write a
 * plausible-looking match is the most trust-building thing on the page, and a
 * transcript that showed only successes would be advertising rather than a log.
 */
export function outcomeTone(part: EveMessagePart): Tone {
	if ("state" in part && part.state === "output-error") return "warning";

	const result = output(part);
	if (!result) return "neutral";

	if (result.applied === true || result.written === true) return "success";
	if (result.stored === false || result.written === false) return "warning";

	return "neutral";
}

/** The pages behind a step, so a rep can check them. */
export function sourcesOf(part: EveMessagePart): Source[] {
	const result = output(part);
	if (!result) return [];

	const urls = new Set<string>();
	for (const key of ["sourceUrl", "profileUrl", "url"]) {
		const value = result[key];
		if (typeof value === "string" && /^https?:\/\//.test(value)) {
			urls.add(value);
		}
	}

	return [...urls].map((url) => {
		const title = hostOf(url);
		return {
			url,
			title,
			network: title.includes("linkedin")
				? ("linkedin" as const)
				: title.includes("github")
					? ("github" as const)
					: ("web" as const),
		};
	});
}

/**
 * A question the agent is parked on, if there is one.
 *
 * Only the latest message is inspected: an older request has either been
 * answered or superseded, and re-rendering a stale prompt invites somebody to
 * answer a question nobody is waiting on.
 */
export function pendingQuestion(messages: readonly EveMessage[]) {
	for (const part of messages.at(-1)?.parts ?? []) {
		if (part.type !== "dynamic-tool") continue;

		const request = part.toolMetadata?.eve?.inputRequest;
		if (request) return request;
	}

	return null;
}

function output(part: EveMessagePart): Record<string, unknown> | null {
	return "output" in part && part.output && typeof part.output === "object"
		? (part.output as Record<string, unknown>)
		: null;
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

/** The sentinel for "start a fresh thread", as opposed to "resume the latest". */
export const NEW_THREAD = "new";

/**
 * Which conversation a panel should show.
 *
 * Pulled out of the component because the rule has three cases and two of them
 * are easy to get wrong: the URL wins when it names a thread, a fresh thread
 * shows nothing, and no URL parameter means the most recent one — which is what
 * makes reopening a contact land where you left off.
 *
 * `landedOn` is the thread the panel *mounted* on, captured once. Re-deriving
 * "the latest" as the list changes would swap the open conversation out from
 * under a live answer the moment the first save added a row.
 */
export function resolveThread<T extends { id: string }>({
	conversations,
	fromUrl,
	landedOn,
}: {
	conversations: readonly T[];
	fromUrl: string | null;
	landedOn: string | null;
}): { openId: string | null; current: T | null } {
	const openId = fromUrl ?? landedOn;

	if (!openId || openId === NEW_THREAD) return { openId, current: null };

	return {
		openId,
		current: conversations.find((row) => row.id === openId) ?? null,
	};
}
