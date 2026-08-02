import { db, EnrichmentStatus, type Prisma } from "@crm/db";
import { domainOf, isDerivedName } from "./names";
import type { Person } from "./socials";

/**
 * The CRM, as far as this agent is concerned.
 *
 * Straight to Postgres through the workspace package rather than through a new
 * internal HTTP API: `@crm/db` is already shared by the API and the app, and a
 * third caller does not justify inventing a service boundary.
 *
 * Everything that *writes a claim* lives in `facts.ts` instead. This file reads,
 * and does the two bookkeeping writes that are not claims about a person: the
 * "we looked" stamp and the enrichment status the sheet polls.
 */

export type WorkItem = {
	id: string;
	fullName: string;
	email: string | null;
	title: string | null;
	companyName: string | null;
	companyDomain: string | null;
	linkedinUrl: string | null;
	/** What is missing, so the agent does not redo the parts that are done. */
	needs: {
		identity: boolean;
		brief: boolean;
		socials: boolean;
	};
};

/**
 * Everything the agent could usefully do to a contact right now.
 *
 * One query instead of the two "list contacts that need X" tools this replaced.
 * Those encoded the *order* of the work in their names, which is exactly the
 * decision the agent is supposed to be making: whether an unnamed contact on a
 * live deal matters more than a named one with no background is a judgement,
 * not a schedule.
 */
export async function contactsNeedingWork(
	limit: number,
	scope: Prisma.ContactWhereInput = {},
): Promise<WorkItem[]> {
	const rows = await db.contact.findMany({
		where: {
			AND: [
				{ archivedAt: null },
				scope,
				{
					OR: [
						{ brief: { is: null } },
						{ socialsCheckedAt: null },
						{ AND: [{ email: { not: null } }, { lastName: null }] },
					],
				},
			],
		},
		select: {
			id: true,
			email: true,
			firstName: true,
			lastName: true,
			title: true,
			linkedinUrl: true,
			socialsCheckedAt: true,
			company: { select: { name: true, domain: true } },
			brief: { select: { contactId: true } },
		},
		orderBy: { createdAt: "asc" },
		take: limit,
	});

	return rows.map((row) => ({
		id: row.id,
		fullName: [row.firstName, row.lastName].filter(Boolean).join(" "),
		email: row.email,
		title: row.title,
		companyName: row.company?.name ?? null,
		companyDomain:
			row.company?.domain ?? (row.email ? domainOf(row.email) : null),
		linkedinUrl: row.linkedinUrl,
		needs: {
			identity: isDerivedName(row.email, row.firstName, row.lastName),
			brief: row.brief === null,
			socials: row.socialsCheckedAt === null,
		},
	}));
}

/**
 * Who the CRM says this person is — the only input the verification checks are
 * allowed to measure a candidate against.
 *
 * Loaded here rather than taken from tool arguments: a check run against a name
 * and employer the model supplied is a check the model can pass by supplying
 * different ones.
 */
export async function personForVerification(
	contactId: string,
): Promise<Person | null> {
	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			firstName: true,
			lastName: true,
			title: true,
			email: true,
			company: { select: { name: true, domain: true } },
		},
	});

	if (!contact) return null;

	return {
		firstName: contact.firstName,
		lastName: contact.lastName,
		fullName: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
		title: contact.title,
		companyName: contact.company?.name ?? null,
		companyDomain:
			contact.company?.domain ??
			(contact.email ? domainOf(contact.email) : null),
	};
}

/** The LinkedIn slug on a contact, or null if they have no profile on file. */
export async function contactProfileSlug(
	contactId: string,
): Promise<{ slug: string; profileUrl: string } | null> {
	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: { linkedinUrl: true },
	});

	const slug = linkedinSlug(contact?.linkedinUrl ?? null);
	return slug
		? { slug, profileUrl: `https://www.linkedin.com/in/${slug}` }
		: null;
}

/** `https://www.linkedin.com/in/lewiscarhart/` → `lewiscarhart`. */
export function linkedinSlug(url: string | null): string | null {
	if (!url) return null;
	const match = /linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/.exec(url);
	return match?.[1] ?? null;
}

export type CrmHistory = {
	contact: {
		fullName: string;
		email: string | null;
		title: string | null;
		companyName: string | null;
		/**
		 * The company **id**, not just its name.
		 *
		 * Its absence was a real dead end: every company tool takes an id, this
		 * was the only place a contact session could have learned one, and it
		 * returned a display string. So an agent sitting on a contact who plainly
		 * works somewhere reported that it had no company to look at.
		 */
		company: {
			id: string;
			name: string;
			domain: string | null;
			industry: string | null;
		} | null;
	};
	/** The deals this person is attached to — the other way out of a contact. */
	deals: {
		id: string;
		name: string;
		stage: string;
		role: string | null;
		amount: number | null;
		currency: string;
		expectedCloseDate: string | null;
	}[];
	threads: {
		subject: string | null;
		messageCount: number;
		lastMessageAt: string;
		messages: {
			direction: string;
			from: string;
			fromName: string | null;
			sentAt: string;
			/** The whole message. See the note on this function. */
			body: string | null;
		}[];
	}[];
	meetings: {
		title: string | null;
		startsAt: string;
		attended: boolean;
		attendees: { email: string; name: string | null }[];
	}[];
	stats: {
		emails: number;
		theyReplied: boolean;
		lastReplyAt: string | null;
		meetings: number;
		nextMeetingAt: string | null;
	};
	colleagues: { id: string; name: string; title: string | null }[];
};

/**
 * Everything we already know about this person from our own mailbox and
 * calendar — **including full message bodies**.
 *
 * This is the single biggest advantage we have over a data vendor, and it is
 * not close. A reply on a thread is proof of identity nobody can sell us. A
 * signature block settles a job title outright, and it settles it more
 * reliably than LinkedIn, because people update their signature when they get
 * promoted and update LinkedIn when they change jobs.
 *
 * Bodies are included deliberately: this is a single-tenant internal tool and
 * the data is already ours. The boundary is egress, not access — see the
 * `data-boundaries` skill. Nothing returned here may be pasted into a web
 * search, written to the sandbox, or logged.
 */
export async function readCrmHistory(
	contactId: string,
	options: {
		threads?: number;
		messagesPerThread?: number;
		dealWhere?: Prisma.DealWhereInput;
		contactWhere?: Prisma.ContactWhereInput;
	} = {},
): Promise<CrmHistory | null> {
	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			email: true,
			title: true,
			companyId: true,
			company: {
				select: { id: true, name: true, domain: true, industry: true },
			},
			deals: {
				where: {
					deal: { AND: [{ archivedAt: null }, options.dealWhere ?? {}] },
				},
				orderBy: { deal: { lastActivityAt: "desc" } },
				select: {
					role: true,
					deal: {
						select: {
							id: true,
							name: true,
							stage: { select: { name: true } },
							amount: true,
							currency: true,
							expectedCloseDate: true,
						},
					},
				},
			},
		},
	});

	if (!contact) return null;

	const [threads, meetings, colleagues] = await Promise.all([
		db.emailThread.findMany({
			where: { contactId },
			orderBy: { lastMessageAt: "desc" },
			take: options.threads ?? 5,
			select: {
				subject: true,
				messageCount: true,
				lastMessageAt: true,
				messages: {
					orderBy: { sentAt: "desc" },
					take: options.messagesPerThread ?? 6,
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
				OR: [{ contactId }, { attendees: { some: { contactId } } }],
			},
			orderBy: { startsAt: "desc" },
			take: 10,
			select: {
				title: true,
				startsAt: true,
				attendees: {
					select: {
						email: true,
						name: true,
						contactId: true,
						responseStatus: true,
					},
				},
			},
		}),
		contact.companyId
			? db.contact.findMany({
					where: {
						AND: [
							{ companyId: contact.companyId, id: { not: contactId } },
							options.contactWhere ?? {},
						],
					},
					select: { id: true, firstName: true, lastName: true, title: true },
					take: 8,
					orderBy: { lastActivityAt: "desc" },
				})
			: Promise.resolve([]),
	]);

	const inbound = threads
		.flatMap((thread) => thread.messages)
		.filter((message) => message.direction === "INBOUND")
		.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

	const now = new Date();
	const upcoming = meetings
		.filter((meeting) => meeting.startsAt > now)
		.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

	return {
		contact: {
			fullName: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
			email: contact.email,
			title: contact.title,
			companyName: contact.company?.name ?? null,
			company: contact.company,
		},
		deals: contact.deals.map(({ role, deal }) => ({
			id: deal.id,
			name: deal.name,
			stage: deal.stage.name,
			role,
			amount: deal.amount === null ? null : Number(deal.amount),
			currency: deal.currency,
			expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
		})),
		threads: threads.map((thread) => ({
			subject: thread.subject,
			messageCount: thread.messageCount,
			lastMessageAt: thread.lastMessageAt.toISOString(),
			messages: thread.messages.map((message) => ({
				direction: message.direction,
				from: message.fromEmail,
				fromName: message.fromName,
				sentAt: message.sentAt.toISOString(),
				body: message.body ?? message.snippet,
			})),
		})),
		meetings: meetings.map((meeting) => ({
			title: meeting.title,
			startsAt: meeting.startsAt.toISOString(),
			attended: meeting.attendees.some(
				(attendee) =>
					attendee.contactId === contactId &&
					attendee.responseStatus === "accepted",
			),
			attendees: meeting.attendees.map((attendee) => ({
				email: attendee.email,
				name: attendee.name,
			})),
		})),
		stats: {
			emails: threads.reduce((total, thread) => total + thread.messageCount, 0),
			theyReplied: inbound.length > 0,
			lastReplyAt: inbound[0]?.sentAt.toISOString() ?? null,
			meetings: meetings.length,
			nextMeetingAt: upcoming[0]?.startsAt.toISOString() ?? null,
		},
		colleagues: colleagues.map((colleague) => ({
			id: colleague.id,
			name: [colleague.firstName, colleague.lastName].filter(Boolean).join(" "),
			title: colleague.title,
		})),
	};
}

/** Records that we went looking, so nobody looks again next hour. */
export async function stampSocialsChecked(contactId: string): Promise<void> {
	await db.contact.update({
		where: { id: contactId },
		data: { socialsCheckedAt: new Date() },
	});
}

/**
 * The status the contact sheet polls on, mirroring `Company`.
 *
 * Background writes are not invalidations — no client action caused them — so
 * the browser can only find out by asking, and it only knows to stop asking
 * when this settles.
 */
export async function setEnrichmentStatus(
	contactId: string,
	status: EnrichmentStatus,
	error?: string,
): Promise<void> {
	await db.contact.update({
		where: { id: contactId },
		data: {
			enrichmentStatus: status,
			enrichmentError: error ?? null,
			...(status === EnrichmentStatus.COMPLETE
				? { enrichedAt: new Date() }
				: {}),
		},
	});
}

/** Writes a note onto the contact's timeline, stamped as agent-written. */
export async function writeTimelineNote(
	contactId: string,
	subject: string,
	body: string,
	meta: Record<string, unknown> = {},
): Promise<string | null> {
	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: { companyId: true, ownerId: true },
	});
	if (!contact) return null;

	// Activity.createdById is required. Attribute to the contact's owner, or to
	// any user if the contact is unowned — the meta marks it as agent-written so
	// the UI never claims a person typed it.
	const author =
		contact.ownerId ??
		(await db.user.findFirst({ select: { id: true } }))?.id ??
		null;
	if (!author) return null;

	const activity = await db.activity.create({
		data: {
			type: "NOTE",
			subject,
			body,
			occurredAt: new Date(),
			contactId,
			companyId: contact.companyId,
			createdById: author,
			meta: { ...meta, agent: "people-research" },
		},
		select: { id: true },
	});

	return activity.id;
}
