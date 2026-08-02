import { ActivityType, db, EmailDirection, type Prisma } from "@crm/db";
import { isDerivedName } from "./names";

/**
 * The CRM's other two records: companies and deals.
 *
 * `crm.ts` reads a person. This reads what a person hangs off, and it exists
 * because the agent could not. A session opened on a company knew the count of
 * contacts there and not one of their ids, so asked the rep to paste one — the
 * CRM's own join, handed back to the human as homework. A deal was worse: the
 * agent could name the stage and had no way to see what had happened in it.
 *
 * Both reads are free — our own Postgres, no vendor, no budget — and both
 * **name the neighbouring records and give their ids**, because that is what
 * turns "I need an identifier" into a second tool call.
 */

/** How much of a body to hand back. Enough to read a signature block. */
const BODY_LIMIT = 4000;

export type AccountThread = {
	subject: string | null;
	/** Whose thread it is, so a company-wide read is still attributable. */
	contact: { id: string; name: string } | null;
	messageCount: number;
	lastMessageAt: string;
	messages: {
		direction: string;
		from: string;
		fromName: string | null;
		sentAt: string;
		body: string | null;
	}[];
};

export type AccountMeeting = {
	title: string | null;
	startsAt: string;
	upcoming: boolean;
	attendees: { email: string; name: string | null }[];
};

export type AccountNote = {
	type: string;
	subject: string | null;
	body: string | null;
	occurredAt: string;
};

export type CompanyPerson = {
	id: string;
	name: string;
	title: string | null;
	email: string | null;
	linkedinUrl: string | null;
	lastActivityAt: string | null;
	threads: number;
	meetings: number;
	/** Still named after their email address — nobody has worked out who they are. */
	needsIdentity: boolean;
};

export type CompanyDeal = {
	id: string;
	name: string;
	stage: string;
	open: boolean;
	amount: number | null;
	currency: string;
	expectedCloseDate: string | null;
	lastActivityAt: string | null;
	contacts: { id: string; name: string; role: string | null }[];
};

export type CompanyHistory = {
	company: {
		id: string;
		name: string;
		domain: string | null;
		website: string | null;
		industry: string | null;
		location: string | null;
		description: string | null;
		linkedinUrl: string | null;
		enrichmentStatus: string;
	};
	people: CompanyPerson[];
	deals: CompanyDeal[];
	threads: AccountThread[];
	meetings: AccountMeeting[];
	notes: AccountNote[];
	stats: {
		people: number;
		openDeals: number;
		emails: number;
		meetings: number;
		theyReplied: boolean;
		lastReplyAt: string | null;
		lastReplyFrom: string | null;
		nextMeetingAt: string | null;
	};
};

/**
 * Everything we know about an account: who works there, what is being sold to
 * them, and every word exchanged with any of them.
 *
 * The people list is the point. A company session that cannot name its own
 * contacts spends its first turn asking the rep for a cuid, and a rep who has
 * the record open on screen is being asked to do the join by hand.
 */
export async function readCompanyHistory(
	companyId: string,
	options: {
		threads?: number;
		messagesPerThread?: number;
		people?: number;
		contactWhere?: Prisma.ContactWhereInput;
		dealWhere?: Prisma.DealWhereInput;
	} = {},
): Promise<CompanyHistory | null> {
	const company = await db.company.findUnique({
		where: { id: companyId },
		select: {
			id: true,
			name: true,
			domain: true,
			website: true,
			industry: true,
			subIndustry: true,
			city: true,
			country: true,
			description: true,
			linkedinUrl: true,
			enrichmentStatus: true,
		},
	});

	if (!company) return null;

	// A thread or a meeting is stamped with the company when the sync can
	// resolve one, but it is only ever stamped with the contact when the
	// counterparty was already on file — so both paths are checked. Missing the
	// second reads as an account nobody has ever emailed.
	const belongsToCompany = { OR: [{ companyId }, { contact: { companyId } }] };

	const [people, deals, threads, meetings, notes, lastInbound, counts] =
		await Promise.all([
			db.contact.findMany({
				where: {
					AND: [{ companyId, archivedAt: null }, options.contactWhere ?? {}],
				},
				orderBy: [{ lastActivityAt: "desc" }, { createdAt: "asc" }],
				take: options.people ?? 25,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					title: true,
					email: true,
					linkedinUrl: true,
					lastActivityAt: true,
					_count: { select: { emailThreads: true, calendarEvents: true } },
				},
			}),
			db.deal.findMany({
				where: {
					AND: [{ companyId, archivedAt: null }, options.dealWhere ?? {}],
				},
				orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
				take: 20,
				select: {
					id: true,
					name: true,
					stage: { select: { name: true, type: true } },
					amount: true,
					currency: true,
					expectedCloseDate: true,
					lastActivityAt: true,
					contacts: {
						where: { contact: { archivedAt: null } },
						select: {
							role: true,
							contact: {
								select: { id: true, firstName: true, lastName: true },
							},
						},
					},
				},
			}),
			db.emailThread.findMany({
				where: belongsToCompany,
				orderBy: { lastMessageAt: "desc" },
				take: options.threads ?? 5,
				select: {
					subject: true,
					messageCount: true,
					lastMessageAt: true,
					contact: { select: { id: true, firstName: true, lastName: true } },
					messages: {
						orderBy: { sentAt: "desc" },
						take: options.messagesPerThread ?? 4,
						select: {
							direction: true,
							fromEmail: true,
							fromName: true,
							sentAt: true,
							body: true,
							snippet: true,
						},
					},
				},
			}),
			db.calendarEvent.findMany({
				where: {
					OR: [
						{ companyId },
						{ contact: { companyId } },
						{ attendees: { some: { contact: { companyId } } } },
					],
				},
				orderBy: { startsAt: "desc" },
				take: 10,
				select: {
					title: true,
					startsAt: true,
					attendees: { select: { email: true, name: true } },
				},
			}),
			recentNotes({ companyId }),
			db.emailMessage.findFirst({
				where: {
					direction: EmailDirection.INBOUND,
					thread: belongsToCompany,
				},
				orderBy: { sentAt: "desc" },
				select: { sentAt: true, fromEmail: true, fromName: true },
			}),
			Promise.all([
				db.contact.count({ where: { companyId, archivedAt: null } }),
				db.emailMessage.count({ where: { thread: belongsToCompany } }),
				db.calendarEvent.count({
					where: {
						OR: [{ companyId }, { contact: { companyId } }],
					},
				}),
			]),
		]);

	const [peopleCount, emailCount, meetingCount] = counts;
	const now = new Date();

	return {
		company: {
			id: company.id,
			name: company.name,
			domain: company.domain,
			website: company.website,
			industry: [company.industry, company.subIndustry]
				.filter(Boolean)
				.join(" / "),
			location: [company.city, company.country].filter(Boolean).join(", "),
			description: company.description,
			linkedinUrl: company.linkedinUrl,
			enrichmentStatus: company.enrichmentStatus,
		},
		people: people.map((person) => ({
			id: person.id,
			name: fullName(person),
			title: person.title,
			email: person.email,
			linkedinUrl: person.linkedinUrl,
			lastActivityAt: person.lastActivityAt?.toISOString() ?? null,
			threads: person._count.emailThreads,
			meetings: person._count.calendarEvents,
			needsIdentity: isDerivedName(
				person.email,
				person.firstName,
				person.lastName,
			),
		})),
		deals: deals.map(toCompanyDeal),
		threads: threads.map(toAccountThread),
		meetings: meetings.map((meeting) => toAccountMeeting(meeting, now)),
		notes,
		stats: {
			people: peopleCount,
			openDeals: deals.filter((deal) => isOpen(deal.stage.type)).length,
			emails: emailCount,
			meetings: meetingCount,
			theyReplied: lastInbound !== null,
			lastReplyAt: lastInbound?.sentAt.toISOString() ?? null,
			lastReplyFrom: lastInbound
				? (lastInbound.fromName ?? lastInbound.fromEmail)
				: null,
			nextMeetingAt:
				meetings
					.filter((meeting) => meeting.startsAt > now)
					.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]
					?.startsAt.toISOString() ?? null,
		},
	};
}

export type DealHistory = {
	deal: {
		id: string;
		name: string;
		stage: string;
		open: boolean;
		daysInStage: number;
		stageChangedAt: string;
		amount: number | null;
		currency: string;
		expectedCloseDate: string | null;
		closedAt: string | null;
		closedReason: string | null;
		owner: string | null;
		createdAt: string;
	};
	company: { id: string; name: string; domain: string | null };
	people: {
		id: string;
		name: string;
		title: string | null;
		email: string | null;
		role: string | null;
	}[];
	/** Every stage this deal has been through, oldest first. */
	stageHistory: { from: string | null; to: string | null; at: string }[];
	threads: AccountThread[];
	meetings: AccountMeeting[];
	notes: AccountNote[];
	stats: {
		theyReplied: boolean;
		lastReplyAt: string | null;
		lastReplyFrom: string | null;
		nextMeetingAt: string | null;
		daysSinceLastActivity: number | null;
	};
	/** Why the correspondence here is the account's and not the deal's. */
	note: string;
};

/**
 * Where a deal actually stands, as opposed to what its stage field says.
 *
 * The two answers differ often enough to be the reason this exists: a deal
 * sitting in `CONTRACT_SENT` for six weeks with no inbound reply is not a
 * contract-sent deal, and the only way to know is to read the stage clock, the
 * last reply and the next meeting together.
 */
export async function readDealHistory(
	dealId: string,
	options: {
		threads?: number;
		messagesPerThread?: number;
		contactWhere?: Prisma.ContactWhereInput;
	} = {},
): Promise<DealHistory | null> {
	const deal = await db.deal.findUnique({
		where: { id: dealId },
		select: {
			id: true,
			name: true,
			stage: { select: { name: true, type: true } },
			stageChangedAt: true,
			amount: true,
			currency: true,
			expectedCloseDate: true,
			closedAt: true,
			closedReason: true,
			lastActivityAt: true,
			createdAt: true,
			owner: { select: { name: true, email: true } },
			company: { select: { id: true, name: true, domain: true } },
			contacts: {
				where: {
					contact: {
						AND: [{ archivedAt: null }, options.contactWhere ?? {}],
					},
				},
				select: {
					role: true,
					contact: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							title: true,
							email: true,
						},
					},
				},
			},
		},
	});

	if (!deal) return null;

	const contactIds = deal.contacts.map(({ contact }) => contact.id);

	// Email and calendar are filed against a person and a company, never against
	// a deal — Google has no idea our deals exist. So the correspondence here is
	// the account's, narrowed to the people on the deal where there are any. The
	// return says so rather than letting the agent infer that every thread it is
	// reading was about this deal.
	const relatedThreads =
		contactIds.length > 0
			? {
					OR: [
						{ contactId: { in: contactIds } },
						{ companyId: deal.company.id },
					],
				}
			: { companyId: deal.company.id };

	const [stageChanges, threads, meetings, notes, lastInbound] =
		await Promise.all([
			db.activity.findMany({
				where: { dealId, type: ActivityType.STAGE_CHANGE },
				orderBy: { createdAt: "asc" },
				take: 25,
				select: { meta: true, createdAt: true },
			}),
			db.emailThread.findMany({
				where: relatedThreads,
				orderBy: { lastMessageAt: "desc" },
				take: options.threads ?? 5,
				select: {
					subject: true,
					messageCount: true,
					lastMessageAt: true,
					contact: { select: { id: true, firstName: true, lastName: true } },
					messages: {
						orderBy: { sentAt: "desc" },
						take: options.messagesPerThread ?? 4,
						select: {
							direction: true,
							fromEmail: true,
							fromName: true,
							sentAt: true,
							body: true,
							snippet: true,
						},
					},
				},
			}),
			db.calendarEvent.findMany({
				where:
					contactIds.length > 0
						? {
								OR: [
									{ contactId: { in: contactIds } },
									{ attendees: { some: { contactId: { in: contactIds } } } },
									{ companyId: deal.company.id },
								],
							}
						: { companyId: deal.company.id },
				orderBy: { startsAt: "desc" },
				take: 10,
				select: {
					title: true,
					startsAt: true,
					attendees: { select: { email: true, name: true } },
				},
			}),
			recentNotes({ dealId }),
			db.emailMessage.findFirst({
				where: { direction: EmailDirection.INBOUND, thread: relatedThreads },
				orderBy: { sentAt: "desc" },
				select: { sentAt: true, fromEmail: true, fromName: true },
			}),
		]);

	const now = new Date();

	return {
		deal: {
			id: deal.id,
			name: deal.name,
			stage: deal.stage.name,
			open: isOpen(deal.stage.type),
			daysInStage: daysSince(deal.stageChangedAt, now),
			stageChangedAt: deal.stageChangedAt.toISOString(),
			amount: deal.amount === null ? null : Number(deal.amount),
			currency: deal.currency,
			expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			closedAt: deal.closedAt?.toISOString() ?? null,
			closedReason: deal.closedReason,
			owner: deal.owner?.name ?? deal.owner?.email ?? null,
			createdAt: deal.createdAt.toISOString(),
		},
		company: deal.company,
		people: deal.contacts.map(({ role, contact }) => ({
			id: contact.id,
			name: fullName(contact),
			title: contact.title,
			email: contact.email,
			role,
		})),
		stageHistory: stageChanges.map((change) => {
			const meta = (change.meta ?? {}) as { from?: unknown; to?: unknown };
			return {
				from: typeof meta.from === "string" ? meta.from : null,
				to: typeof meta.to === "string" ? meta.to : null,
				at: change.createdAt.toISOString(),
			};
		}),
		threads: threads.map(toAccountThread),
		meetings: meetings.map((meeting) => toAccountMeeting(meeting, now)),
		notes,
		stats: {
			theyReplied: lastInbound !== null,
			lastReplyAt: lastInbound?.sentAt.toISOString() ?? null,
			lastReplyFrom: lastInbound
				? (lastInbound.fromName ?? lastInbound.fromEmail)
				: null,
			nextMeetingAt:
				meetings
					.filter((meeting) => meeting.startsAt > now)
					.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]
					?.startsAt.toISOString() ?? null,
			daysSinceLastActivity: deal.lastActivityAt
				? daysSince(deal.lastActivityAt, now)
				: null,
		},
		note:
			contactIds.length > 0
				? "Email and meetings are filed against people and companies, never against a deal. The correspondence here is with the people on this deal and with the rest of the account — read the subjects before treating any of it as being about this deal."
				: "Nobody is attached to this deal, so the correspondence here is the whole account's. Attaching the people on it would make this answer sharper.",
	};
}

/** The stages that are still in play. */
function isOpen(type: string): boolean {
	return type === "OPEN";
}

/**
 * Typed notes on the timeline, without the email and meeting projections.
 *
 * Every thread and every event already lands on the timeline as an `Activity`,
 * so including those types here would hand the same conversation back twice —
 * once as a note saying an email happened, and once as the email.
 */
async function recentNotes(
	where: { companyId: string } | { dealId: string },
): Promise<AccountNote[]> {
	const rows = await db.activity.findMany({
		where: {
			...where,
			type: {
				in: [
					ActivityType.NOTE,
					ActivityType.CALL,
					ActivityType.TASK,
					ActivityType.ENRICHMENT,
				],
			},
		},
		orderBy: { createdAt: "desc" },
		take: 10,
		select: {
			type: true,
			subject: true,
			body: true,
			occurredAt: true,
			createdAt: true,
		},
	});

	return rows.map((row) => ({
		type: row.type,
		subject: row.subject,
		body: row.body ? row.body.slice(0, BODY_LIMIT) : null,
		occurredAt: (row.occurredAt ?? row.createdAt).toISOString(),
	}));
}

function toAccountThread(thread: {
	subject: string | null;
	messageCount: number;
	lastMessageAt: Date;
	contact: { id: string; firstName: string; lastName: string | null } | null;
	messages: {
		direction: string;
		fromEmail: string;
		fromName: string | null;
		sentAt: Date;
		body: string | null;
		snippet: string | null;
	}[];
}): AccountThread {
	return {
		subject: thread.subject,
		contact: thread.contact
			? { id: thread.contact.id, name: fullName(thread.contact) }
			: null,
		messageCount: thread.messageCount,
		lastMessageAt: thread.lastMessageAt.toISOString(),
		messages: thread.messages.map((message) => ({
			direction: message.direction,
			from: message.fromEmail,
			fromName: message.fromName,
			sentAt: message.sentAt.toISOString(),
			body: (message.body ?? message.snippet)?.slice(0, BODY_LIMIT) ?? null,
		})),
	};
}

function toAccountMeeting(
	meeting: {
		title: string | null;
		startsAt: Date;
		attendees: { email: string; name: string | null }[];
	},
	now: Date,
): AccountMeeting {
	return {
		title: meeting.title,
		startsAt: meeting.startsAt.toISOString(),
		upcoming: meeting.startsAt > now,
		attendees: meeting.attendees,
	};
}

function toCompanyDeal(deal: {
	id: string;
	name: string;
	stage: { name: string; type: string };
	amount: unknown;
	currency: string;
	expectedCloseDate: Date | null;
	lastActivityAt: Date | null;
	contacts: {
		role: string | null;
		contact: { id: string; firstName: string; lastName: string | null };
	}[];
}): CompanyDeal {
	return {
		id: deal.id,
		name: deal.name,
		stage: deal.stage.name,
		open: isOpen(deal.stage.type),
		amount: deal.amount === null ? null : Number(deal.amount),
		currency: deal.currency,
		expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
		lastActivityAt: deal.lastActivityAt?.toISOString() ?? null,
		contacts: deal.contacts.map(({ role, contact }) => ({
			id: contact.id,
			name: fullName(contact),
			role,
		})),
	};
}

function fullName(person: {
	firstName: string;
	lastName: string | null;
}): string {
	return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

function daysSince(date: Date, now: Date): number {
	return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}
