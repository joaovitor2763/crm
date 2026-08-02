import { db } from "@crm/db";
import type { AgentAccess } from "./access";
import { capabilitiesMarkdown } from "./capabilities";

/**
 * What a session is told before it says anything.
 *
 * Two things vary, and both were getting the agent into trouble.
 *
 * **Which record.** A person, a company and a deal are three different
 * conversations. The company preamble used to say "we know 6 contact(s) here"
 * and could not name one of them, so the agent — knowing people existed and
 * having no way to address any of them — asked the rep to paste a contact id
 * off the screen they were looking at. Every neighbouring record is now named
 * **with its id**, because an id in the preamble is a tool call and a count is
 * a dead end.
 *
 * **Who opened it.** A dispatched task is a research pass with a budget. A rep
 * in the contact sheet is a conversation. Told neither, the agent assumed the
 * first, which is how a question got a work plan back.
 *
 * Pure apart from reading the database: the focus to seed is *returned* rather
 * than set, so `instructions/task.ts` owns that one side effect and these are
 * testable outside an eve turn.
 */

export type Opened = {
	/** Started by `schedules/dispatch.ts` rather than by a person. */
	dispatched: boolean;
	kind?: string | null;
	reason?: string | null;
	budget?: number | null;
};

export type Preamble = {
	markdown: string;
	/** What the audit hook should file this session's events against. */
	focus: { contactId?: string | null; companyId?: string | null };
};

/** The record the session was opened on, whichever it is. */
export async function sessionPreamble(
	record: {
		contactId?: string | null;
		companyId?: string | null;
		dealId?: string | null;
	},
	opened: Opened,
	access?: AgentAccess,
): Promise<Preamble> {
	if (record.contactId)
		return contactPreamble(record.contactId, opened, access);
	if (record.companyId)
		return companyPreamble(record.companyId, opened, access);
	if (record.dealId) return dealPreamble(record.dealId, opened, access);
	return noRecordPreamble();
}

/**
 * What kind of exchange this is, said in one line.
 *
 * The same record supports both, and they want opposite behaviour: a
 * dispatched pass should go and find things, a rep with the sheet open wants
 * the question in front of them answered from what we already have.
 */
function opening(opened: Opened, questions: string): string {
	if (opened.dispatched) {
		return [
			"This session was started by the dispatcher, not by a person. Nobody is",
			"waiting on a reply — do the work, record what you find, and stop.",
		].join(" ");
	}

	return [
		"**A rep has this record open and is talking to you.** Answer what they",
		`actually asked — usually some form of ${questions} — from what the CRM`,
		"already holds, and say plainly when we do not know something. Research it",
		"further only if the answer needs it or they ask you to. Never ask them for",
		"an id, a name or an address you can look up yourself.",
	].join(" ");
}

/**
 * A session opened from a person's record.
 *
 * Their company id is stated outright. Its absence was a dead end with a
 * confusing symptom: the agent could see where somebody worked, had no id to
 * pass to any company tool, and reported that no company was available — about
 * a contact who plainly had one.
 */
export async function contactPreamble(
	contactId: string,
	opened: Opened,
	access?: AgentAccess,
): Promise<Preamble> {
	const contact = await db.contact.findFirst({
		where: { AND: [{ id: contactId }, access?.contactWhere ?? {}] },
		select: {
			firstName: true,
			lastName: true,
			email: true,
			title: true,
			company: { select: { id: true, name: true, domain: true } },
			brief: { select: { refreshedAt: true } },
			deals: {
				where: {
					deal: { AND: [{ archivedAt: null }, access?.dealWhere ?? {}] },
				},
				orderBy: { deal: { lastActivityAt: "desc" } },
				take: 5,
				select: {
					role: true,
					deal: {
						select: { id: true, name: true, stage: { select: { name: true } } },
					},
				},
			},
			_count: { select: { emailThreads: true, calendarEvents: true } },
		},
	});

	if (!contact) {
		return { markdown: capabilitiesMarkdown(), focus: { contactId } };
	}

	const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

	const known =
		contact._count.emailThreads > 0 || contact._count.calendarEvents > 0
			? `We have ${contact._count.emailThreads} thread(s) and ${contact._count.calendarEvents} meeting(s) with them — read those first.`
			: "We have never corresponded with them, so there is nothing internal to go on.";

	const deals = contact.deals
		.map(
			({ role, deal }) =>
				`${deal.name} (${deal.stage.name}${role ? `, ${role}` : ""}) \`${deal.id}\``,
		)
		.join("; ");

	const markdown = [
		"## This session",
		"",
		`You are working on **${name}** (\`${contactId}\`)${
			contact.email ? `, ${contact.email}` : ""
		}${contact.title ? `, ${contact.title}` : ""}.`,
		opened.kind ? `Task: **${opened.kind}**.` : "",
		opened.reason ? `Why now: ${opened.reason}` : "",
		opened.budget
			? `Budget: **${opened.budget}** vendor calls. Spend them where they matter.`
			: "",
		"",
		opening(
			opened,
			"who this person is, whether they are still there, or what to know before a call",
		),
		"",
		contact.company
			? `They work at **${contact.company.name}**${
					contact.company.domain ? ` (${contact.company.domain})` : ""
				}, company id \`${contact.company.id}\` — pass that straight to \`read_company_history\`, \`enrich_company\` or \`research_company\` when the question reaches past this one person.`
			: "They are not attached to a company. `search_crm` will find one by name or domain if the conversation needs it.",
		deals ? `They are on: ${deals}.` : "They are not on any deal.",
		"",
		known,
		contact.brief
			? `A background already exists, written ${contact.brief.refreshedAt.toDateString()}. Replace it only if you learn something it does not say.`
			: "There is no background on them yet.",
		"",
		"Start with `read_crm_history` on this contact id.",
		"",
		capabilitiesMarkdown(),
	]
		.filter(Boolean)
		.join("\n");

	return {
		markdown,
		focus: { contactId, companyId: contact.company?.id ?? null },
	};
}

/**
 * A session opened from a company's record.
 *
 * The people are **named, with their ids**, which is the whole fix: a count
 * told the agent that contacts existed without letting it address one, so it
 * handed the CRM's own join back to the person using it.
 */
export async function companyPreamble(
	companyId: string,
	opened: Opened,
	access?: AgentAccess,
): Promise<Preamble> {
	const company = await db.company.findFirst({
		where: { AND: [{ id: companyId }, access?.companyWhere ?? {}] },
		select: {
			name: true,
			domain: true,
			industry: true,
			description: true,
			contacts: {
				where: { AND: [{ archivedAt: null }, access?.contactWhere ?? {}] },
				orderBy: [{ lastActivityAt: "desc" }, { createdAt: "asc" }],
				take: 12,
				select: { id: true, firstName: true, lastName: true, title: true },
			},
			deals: {
				where: { AND: [{ archivedAt: null }, access?.dealWhere ?? {}] },
				orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
				take: 8,
				select: { id: true, name: true, stage: { select: { name: true } } },
			},
			_count: {
				select: {
					contacts: {
						where: {
							AND: [{ archivedAt: null }, access?.contactWhere ?? {}],
						},
					},
				},
			},
		},
	});

	if (!company) {
		return { markdown: capabilitiesMarkdown(), focus: { companyId } };
	}

	const people = company.contacts
		.map((person) => {
			const name = [person.firstName, person.lastName]
				.filter(Boolean)
				.join(" ");
			return `- ${name}${person.title ? ` — ${person.title}` : ""} \`${person.id}\``;
		})
		.join("\n");

	const more =
		company._count.contacts > company.contacts.length
			? `\n- …and ${company._count.contacts - company.contacts.length} more; \`read_company_history\` lists them all.`
			: "";

	const deals = company.deals
		.map((deal) => `${deal.name} (${deal.stage.name}) \`${deal.id}\``)
		.join("; ");

	const markdown = [
		"## This session",
		"",
		`You are working on **${company.name}**${
			company.domain ? ` (${company.domain})` : ""
		}${company.industry ? `, ${company.industry}` : ""} — company id \`${companyId}\`.`,
		"",
		opening(
			opened,
			"what this company does, who we know there, or what has changed recently",
		),
		"",
		people
			? `### Who we know there (${company._count.contacts})\n\n${people}${more}\n\nThose are contact ids. Use them directly — with \`read_crm_history\`, \`identify_contact\` or \`record_fact\`. Never ask a rep which contact they mean without naming these first.`
			: "We have no contacts on file here yet.",
		"",
		deals ? `Deals: ${deals}.` : "There are no deals here.",
		company.description
			? "There is already a description on the record."
			: "There is no description on the record yet.",
		"",
		"Start with `read_company_history` on this company id — it returns the people, the deals, the correspondence and the notes in one free call.",
		"",
		capabilitiesMarkdown(),
	]
		.filter(Boolean)
		.join("\n");

	return { markdown, focus: { companyId } };
}

/**
 * A session opened from a deal's record.
 *
 * A deal is the one record where the *state* matters as much as the facts:
 * which stage, how much, who is on it, and when it was last touched. Those are
 * the questions a rep opens a deal to ask, so they are what the session starts
 * knowing.
 */
export async function dealPreamble(
	dealId: string,
	opened: Opened,
	access?: AgentAccess,
): Promise<Preamble> {
	const deal = await db.deal.findFirst({
		where: { AND: [{ id: dealId }, access?.dealWhere ?? {}] },
		select: {
			name: true,
			stage: { select: { name: true } },
			amount: true,
			currency: true,
			expectedCloseDate: true,
			lastActivityAt: true,
			company: { select: { id: true, name: true } },
			contacts: {
				where: { contact: access?.contactWhere ?? {} },
				select: {
					role: true,
					contact: {
						select: { id: true, firstName: true, lastName: true, title: true },
					},
				},
			},
		},
	});

	if (!deal) return { markdown: capabilitiesMarkdown(), focus: {} };

	const people = deal.contacts
		.map(({ role, contact }) => {
			const name = [contact.firstName, contact.lastName]
				.filter(Boolean)
				.join(" ");
			return `${name}${contact.title ? ` (${contact.title})` : ""}${
				role ? ` — ${role}` : ""
			} \`${contact.id}\``;
		})
		.join("; ");

	const markdown = [
		"## This session",
		"",
		`You are working on the deal **${deal.name}**${
			deal.company ? ` at ${deal.company.name}` : ""
		} — deal id \`${dealId}\`${
			deal.company ? `, company id \`${deal.company.id}\`` : ""
		}.`,
		`Stage: **${deal.stage.name}**${
			deal.amount
				? `. Amount: ${deal.amount} ${deal.currency ?? ""}`.trim()
				: ""
		}${
			deal.expectedCloseDate
				? `. Expected close: ${deal.expectedCloseDate.toDateString()}`
				: ""
		}.`,
		deal.lastActivityAt
			? `Last touched ${deal.lastActivityAt.toDateString()}.`
			: "Nothing has happened on it yet.",
		people ? `People on it: ${people}` : "Nobody is attached to it yet.",
		"",
		opening(
			opened,
			"where this stands, who else should be involved, or what the risk is",
		),
		"",
		"Start with `read_deal_history` on this deal id. It returns the stage clock, every stage this deal has moved through, the last reply from their side and the next meeting — which is how you answer *where does this stand* rather than reciting the stage field back.",
		"",
		"You can research the people and the company behind it with the usual tools — a deal itself has no fields to enrich, so anything you learn is recorded against them.",
		"",
		capabilitiesMarkdown(),
	].join("\n");

	// Focused on the company, because that is the record every fact the agent
	// can write hangs off — a deal has no fields of its own to enrich.
	return { markdown, focus: { companyId: deal.company?.id ?? null } };
}

/**
 * No record at all — the dev TUI, or a dispatched pass over the queue.
 *
 * Worth saying rather than falling through to bare capabilities: without it
 * the agent has no idea the CRM is searchable, and waits to be handed an id.
 */
export function noRecordPreamble(): Preamble {
	return {
		markdown: [
			"## This session",
			"",
			"No record was named, so nothing is in focus yet.",
			"`list_outstanding_work` shows contacts with research outstanding, and",
			"`search_crm` finds any contact, company or deal by name, email address or",
			"domain. `search_revenue_accounts` finds commercial Conta records (RevenueAccount),",
			"which are separate from Better Auth accounts. Look the record up rather than asking for an id.",
			"",
			capabilitiesMarkdown(),
		].join("\n"),
		focus: {},
	};
}
