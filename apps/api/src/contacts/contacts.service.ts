import {
	AuditActorType,
	type ContactBriefSections,
	type Db,
	type FactEvidence,
	FactStatus,
	type Prisma,
	Prisma as PrismaNamespace,
	type RecordSource,
} from "@crm/db";
import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import {
	DEFAULT_BUSINESS_UNIT_ID,
	DEFAULT_TEAM_ID,
} from "../access-control/access-control.constants";
import type { EffectivePrincipal } from "../access-control/access-control.types";
import { AgentQueueService } from "../agent/agent-queue.service";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { CompanyDirectoryService } from "../companies/company-directory.service";
import { blankToNull, toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	ownerFilter,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ContactCreateInput,
	ContactListInput,
	ContactUpdateInput,
	FactDecisionInput,
} from "./contacts.contracts";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const COMPANY_SELECT = {
	id: true,
	name: true,
	domain: true,
	iconUrl: true,
	iconDarkUrl: true,
	iconTone: true,
	logoUrl: true,
} as const;

/** The facet value for a contact who works nowhere we know of. */
const NO_COMPANY = "none";

/**
 * Which `Contact` column an accepted fact writes through to.
 *
 * The agent's `facts.ts` holds the same map, because it is the one deciding
 * what a field means; this half only needs to know where an accepted value
 * lands. Fields absent from here (`seniority`, `employer`, `location`) have no
 * column — they are read straight off the fact by the background panel.
 */
const FACT_COLUMNS: Record<string, string | undefined> = {
	title: "title",
	linkedinUrl: "linkedinUrl",
	twitterUrl: "twitterUrl",
	githubUrl: "githubUrl",
};

export type ContactRow = {
	id: string;
	firstName: string;
	lastName: string | null;
	email: string | null;
	title: string | null;
	/** Our mirrored copy, never LinkedIn's expiring CDN URL. */
	imageUrl: string | null;
	company: {
		id: string;
		name: string;
		domain: string | null;
		iconUrl: string | null;
		iconDarkUrl: string | null;
		iconTone: string | null;
		logoUrl: string | null;
	} | null;
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	lastActivityAt: string | null;
	createdAt: string;
	globalLifecycleStage: string;
};

/**
 * Orderings are arrays so every column can carry a tiebreak: without one,
 * everybody at the same company comes back in whatever order Postgres feels
 * like, and the order changes between pages of the same query.
 */
const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.ContactOrderByWithRelationInput[]
> = {
	// Surname first — a list of people sorted by first name is a list nobody can
	// scan.
	name: (dir) => [{ lastName: dir }, { firstName: dir }],
	email: (dir) => [{ email: dir }],
	title: (dir) => [{ title: dir }, { lastName: "asc" }],
	company: (dir) => [{ company: { name: dir } }, { lastName: "asc" }],
	createdAt: (dir) => [{ createdAt: dir }],
	owner: (dir) => [{ owner: { name: dir } }, { lastName: "asc" }],
	lastActivity: (dir) => [{ lastActivityAt: { sort: dir, nulls: "last" } }],
};

@Injectable()
export class ContactsService {
	private readonly logger = new Logger(ContactsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly companies: CompanyDirectoryService,
		private readonly agent: AgentTriggerService,
		private readonly queue: AgentQueueService,
	) {}

	async list(
		input: ContactListInput,
		scope: Prisma.ContactWhereInput = {},
		companyScope: Prisma.CompanyWhereInput = {},
	): Promise<ListResult<ContactRow>> {
		const where: Prisma.ContactWhereInput = {
			AND: [this.buildWhere(input), scope],
		};
		const { skip, take } = paginate(input);

		const [rows, total, facetCounts] = await Promise.all([
			this.db.contact.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, [{ createdAt: "desc" }]),
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					title: true,
					imageUrl: true,
					globalLifecycleStage: true,
					source: true,
					company: { where: companyScope, select: COMPANY_SELECT },
					owner: { select: OWNER_SELECT },
					lastActivityAt: true,
					createdAt: true,
				},
			}),
			this.db.contact.count({ where }),
			this.facetCounts(input, scope),
		]);

		return {
			rows: rows.map((row) => ({
				...row,
				lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
				createdAt: row.createdAt.toISOString(),
			})),
			total,
			facetCounts,
		};
	}

	async byId(
		id: string,
		scope: Prisma.ContactWhereInput = {},
		companyScope: Prisma.CompanyWhereInput = {},
		dealScope: Prisma.DealWhereInput = {},
	) {
		const contact = await this.db.contact.findFirst({
			where: { AND: [{ id }, scope] },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				phone: true,
				title: true,
				archivedAt: true,
				utmSource: true,
				utmMedium: true,
				utmCampaign: true,
				utmTerm: true,
				utmContent: true,
				linkedinUrl: true,
				twitterUrl: true,
				githubUrl: true,
				imageUrl: true,
				enrichmentStatus: true,
				enrichmentError: true,
				globalLifecycleStage: true,
				globalMarketingScore: true,
				globallyMarketingQualifiedAt: true,
				globallyMarketingQualifiedReason: true,
				customValues: true,
				unitStates: {
					where: { archivedAt: null },
					orderBy: { businessUnit: { name: "asc" } },
					select: {
						id: true,
						lifecycleStage: true,
						marketingScore: true,
						marketingQualifiedAt: true,
						marketingQualifiedReason: true,
						customValues: true,
						businessUnit: { select: { id: true, key: true, name: true } },
						team: { select: { id: true, key: true, name: true } },
						owner: { select: OWNER_SELECT },
					},
				},
				createdAt: true,
				brief: {
					select: {
						narrative: true,
						sections: true,
						score: true,
						sourceUrl: true,
						refreshedAt: true,
					},
				},
				// Applied facts are the provenance behind values already on the
				// record; proposed ones are suggestions the sheet offers. Dismissed
				// and superseded stay out of the read path — they are history, and
				// the timeline is where history belongs.
				facts: {
					where: { status: { in: [FactStatus.APPLIED, FactStatus.PROPOSED] } },
					orderBy: { observedAt: "desc" },
					select: {
						id: true,
						field: true,
						value: true,
						score: true,
						band: true,
						evidence: true,
						method: true,
						sourceUrl: true,
						status: true,
						observedAt: true,
					},
				},
				company: {
					where: companyScope,
					select: { ...COMPANY_SELECT, industry: true, primaryContactId: true },
				},
				owner: { select: OWNER_SELECT },
				deals: {
					where: {
						deal: { AND: [{ archivedAt: null }, dealScope] },
					},
					select: {
						role: true,
						deal: {
							select: {
								id: true,
								name: true,
								stage: {
									select: { id: true, name: true, position: true, type: true },
								},
								pipeline: { select: { id: true, name: true } },
								amount: true,
								currency: true,
								expectedCloseDate: true,
								owner: { select: OWNER_SELECT },
							},
						},
					},
				},
			},
		});

		if (!contact) {
			throw new NotFoundException(`No contact with id ${id}.`);
		}

		const relationship = await this.relationship(
			id,
			contact.company?.id ?? null,
		);

		const { deals, createdAt, brief, facts, company, unitStates, ...rest } =
			contact;

		return {
			...rest,
			company,
			/** Whether the agent has this person on its list — see `AgentQueueService`. */
			queued: await this.queue.isQueued({ contactId: id }),
			createdAt: createdAt.toISOString(),
			globalMarketingScore: contact.globalMarketingScore?.toString() ?? null,
			globallyMarketingQualifiedAt:
				contact.globallyMarketingQualifiedAt?.toISOString() ?? null,
			unitStates: unitStates.map((state) => ({
				...state,
				marketingScore: state.marketingScore?.toString() ?? null,
				marketingQualifiedAt: state.marketingQualifiedAt?.toISOString() ?? null,
			})),
			brief: brief
				? {
						...brief,
						sections: brief.sections as ContactBriefSections,
						refreshedAt: brief.refreshedAt.toISOString(),
					}
				: null,
			facts: facts.map((fact) => ({
				...fact,
				evidence: fact.evidence as FactEvidence[],
				observedAt: fact.observedAt.toISOString(),
			})),
			/** What we have actually said to each other. */
			relationship,
			/** True when this is the person to call at their company. */
			isPrimaryContact: company?.primaryContactId === contact.id,
			deals: deals.map(({ role, deal }) => ({
				...deal,
				role,
				amount: undefined,
				amountCents: toCents(deal.amount),
				expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			})),
		};
	}

	async archived(scope: Prisma.ContactWhereInput = {}) {
		const rows = await this.db.contact.findMany({
			where: { AND: [{ archivedAt: { not: null } }, scope] },
			orderBy: { archivedAt: "desc" },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				archivedAt: true,
			},
		});
		return rows.map(({ archivedAt, ...row }) => ({
			...row,
			archivedAt: archivedAt?.toISOString() ?? null,
		}));
	}

	async assignments(id: string, scope: Prisma.ContactWhereInput = {}) {
		const contact = await this.db.contact.findFirst({
			where: { AND: [{ id }, scope] },
			select: {
				id: true,
				ownerId: true,
				unitStates: {
					where: { archivedAt: null },
					select: { businessUnitId: true, teamId: true, ownerId: true },
				},
			},
		});
		if (!contact) throw new NotFoundException(`No contact with id ${id}.`);
		return contact;
	}

	async create(input: ContactCreateInput, actor?: EffectivePrincipal) {
		const email = blankToNull(input.email ?? "");

		if (email) {
			const existing = await this.db.contact.findUnique({
				where: { email },
				select: { id: true, firstName: true, lastName: true },
			});
			if (existing) {
				throw new ConflictException(
					`${[existing.firstName, existing.lastName].filter(Boolean).join(" ")} already uses ${email}.`,
				);
			}
		}

		// A work address tells us where someone works. Awaited rather than queued,
		// unlike company enrichment: the contact should arrive already attached to
		// the right company, not attach itself a few seconds later.
		const companyId =
			input.companyId ??
			(email
				? await this.companies.companyForEmail(email, {
						// Same rule as the sync: a company conjured out of somebody's
						// action belongs to them, not to nobody.
						ownerId: input.ownerId,
					})
				: null);

		const businessUnitId = input.businessUnitId ?? DEFAULT_BUSINESS_UNIT_ID;
		const teamId = input.teamId === undefined ? DEFAULT_TEAM_ID : input.teamId;
		const contact = await this.db.$transaction(async (tx) => {
			const created = await tx.contact.create({
				data: {
					firstName: input.firstName.trim(),
					lastName: blankToNull(input.lastName ?? ""),
					email,
					phone: blankToNull(input.phone ?? ""),
					title: blankToNull(input.title ?? ""),
					companyId,
					ownerId: input.ownerId ?? null,
					utmSource: blankToNull(input.utmSource ?? ""),
					utmMedium: blankToNull(input.utmMedium ?? ""),
					utmCampaign: blankToNull(input.utmCampaign ?? ""),
					utmTerm: blankToNull(input.utmTerm ?? ""),
					utmContent: blankToNull(input.utmContent ?? ""),
					customValues: (input.customValues ?? {}) as Prisma.InputJsonObject,
					unitStates: {
						create: {
							businessUnitId,
							teamId,
							ownerId: input.ownerId ?? actor?.userId ?? null,
							leadSource: "MANUAL",
							utmSource: blankToNull(input.utmSource ?? ""),
							utmMedium: blankToNull(input.utmMedium ?? ""),
							utmCampaign: blankToNull(input.utmCampaign ?? ""),
							utmTerm: blankToNull(input.utmTerm ?? ""),
							utmContent: blankToNull(input.utmContent ?? ""),
						},
					},
				},
				select: { id: true, firstName: true, lastName: true },
			});
			await tx.domainEvent.create({
				data: {
					eventKey: `contact.created:${created.id}`,
					type: "contact.created",
					resource: "contacts",
					recordId: created.id,
					businessUnitId,
					teamId,
					actorType: actor?.actorType ?? AuditActorType.SYSTEM,
					actorId: actor?.actorId,
					payload: { source: "MANUAL" },
				},
			});
			return created;
		});

		this.logger.log({ message: "Contact created", contactId: contact.id });

		// A person typed this one, so there is no placeholder name to fix — but
		// there is usually no title, no profile and no background either, and a
		// rep who has just added somebody is the likeliest person to open them
		// again in the next minute.
		await this.agent.contactCreated(
			contact.id,
			"Added by a rep, with nothing on the record yet",
		);

		return contact;
	}

	async update(
		id: string,
		input: ContactUpdateInput,
		scope: Prisma.ContactWhereInput = {},
	) {
		await this.requireScoped(id, scope);
		const data: Prisma.ContactUpdateInput = {};

		if (input.firstName !== undefined) data.firstName = input.firstName.trim();
		if (input.lastName !== undefined)
			data.lastName = blankToNull(input.lastName);
		if (input.email !== undefined) data.email = blankToNull(input.email);
		if (input.phone !== undefined) data.phone = blankToNull(input.phone);
		if (input.title !== undefined) data.title = blankToNull(input.title);
		if (input.linkedinUrl !== undefined) {
			data.linkedinUrl = blankToNull(input.linkedinUrl);
		}
		if (input.twitterUrl !== undefined) {
			data.twitterUrl = blankToNull(input.twitterUrl);
		}
		if (input.githubUrl !== undefined) {
			data.githubUrl = blankToNull(input.githubUrl);
		}
		if (input.utmSource !== undefined)
			data.utmSource = blankToNull(input.utmSource);
		if (input.utmMedium !== undefined)
			data.utmMedium = blankToNull(input.utmMedium);
		if (input.utmCampaign !== undefined)
			data.utmCampaign = blankToNull(input.utmCampaign);
		if (input.utmTerm !== undefined) data.utmTerm = blankToNull(input.utmTerm);
		if (input.utmContent !== undefined)
			data.utmContent = blankToNull(input.utmContent);
		if (input.companyId !== undefined) {
			data.company = input.companyId
				? { connect: { id: input.companyId } }
				: { disconnect: true };
		}
		if (input.ownerId !== undefined) {
			data.owner = input.ownerId
				? { connect: { id: input.ownerId } }
				: { disconnect: true };
		}

		try {
			return await this.db.contact.update({
				where: { id },
				data,
				select: { id: true, firstName: true, lastName: true },
			});
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async archive(id: string, scope: Prisma.ContactWhereInput = {}) {
		await this.requireScoped(id, scope);
		try {
			const [, archived] = await this.db.$transaction([
				this.db.company.updateMany({
					where: { primaryContactId: id },
					data: { primaryContactId: null },
				}),
				this.db.contact.update({
					where: { id },
					data: { archivedAt: new Date() },
					select: { id: true, archivedAt: true },
				}),
			]);
			return archived;
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async restore(id: string, scope: Prisma.ContactWhereInput = {}) {
		await this.requireScoped(id, scope);
		try {
			return await this.db.contact.update({
				where: { id },
				data: { archivedAt: null },
				select: { id: true, archivedAt: true },
			});
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	/**
	 * What we already know from our own mailbox and calendar.
	 *
	 * The one block on this sheet no CRM that buys its data can render: how many
	 * emails, whether they have ever actually replied, when we last heard from
	 * them, what is in the diary, and who else we know at the same company.
	 *
	 * Counts and dates only — the bodies stay out of the API. The agent reads
	 * those (they are the best evidence we have) but the browser has no use for
	 * them here, and shipping a thread into a record payload is how message
	 * content ends up somewhere nobody expected.
	 */
	private async relationship(contactId: string, companyId: string | null) {
		const now = new Date();

		const [threads, lastReply, meetings, nextMeeting, colleagues] =
			await Promise.all([
				this.db.emailThread.aggregate({
					where: { contactId },
					_sum: { messageCount: true },
					_count: { _all: true },
				}),
				this.db.emailMessage.findFirst({
					where: { thread: { contactId }, direction: "INBOUND" },
					orderBy: { sentAt: "desc" },
					select: { sentAt: true },
				}),
				this.db.calendarEvent.count({
					where: {
						OR: [{ contactId }, { attendees: { some: { contactId } } }],
					},
				}),
				this.db.calendarEvent.findFirst({
					where: {
						startsAt: { gt: now },
						OR: [{ contactId }, { attendees: { some: { contactId } } }],
					},
					orderBy: { startsAt: "asc" },
					select: { title: true, startsAt: true },
				}),
				companyId
					? this.db.contact.findMany({
							where: {
								companyId,
								id: { not: contactId },
								archivedAt: null,
							},
							orderBy: { lastActivityAt: { sort: "desc", nulls: "last" } },
							take: 4,
							select: {
								id: true,
								firstName: true,
								lastName: true,
								title: true,
							},
						})
					: Promise.resolve([]),
			]);

		return {
			emails: threads._sum.messageCount ?? 0,
			threads: threads._count._all,
			// The distinction that matters on a sheet: we have emailed them 12
			// times and they have never once written back is a different
			// relationship from 12 emails with 6 replies.
			lastReplyAt: lastReply?.sentAt.toISOString() ?? null,
			meetings,
			nextMeeting: nextMeeting
				? {
						title: nextMeeting.title,
						startsAt: nextMeeting.startsAt.toISOString(),
					}
				: null,
			colleagues: colleagues.map((colleague) => ({
				id: colleague.id,
				name: [colleague.firstName, colleague.lastName]
					.filter(Boolean)
					.join(" "),
				title: colleague.title,
			})),
		};
	}

	/**
	 * A rep accepting or dismissing something the agent proposed.
	 *
	 * Accepting writes the value through to the record and supersedes whatever
	 * was there; dismissing keeps the row so the agent can be told never to
	 * offer it again. Neither branch researches anything — this is a human
	 * decision being executed, which is the only enrichment-shaped thing that
	 * belongs on this side of the wire.
	 */
	async decideFact(
		input: FactDecisionInput,
		userId: string,
		scope: Prisma.ContactWhereInput = {},
	): Promise<{ contactId: string; field: string; applied: boolean }> {
		const fact = await this.db.contactFact.findUnique({
			where: { id: input.factId },
			select: {
				id: true,
				contactId: true,
				field: true,
				value: true,
				status: true,
			},
		});

		if (!fact) {
			throw new NotFoundException(`No fact with id ${input.factId}.`);
		}
		await this.requireScoped(fact.contactId, scope);

		if (fact.status !== FactStatus.PROPOSED) {
			throw new ConflictException("That suggestion has already been settled.");
		}

		const accepted = input.decision === "accept";
		const column = FACT_COLUMNS[fact.field];

		await this.db.$transaction(async (tx) => {
			if (accepted) {
				await tx.contactFact.updateMany({
					where: {
						contactId: fact.contactId,
						field: fact.field,
						status: FactStatus.APPLIED,
					},
					data: { status: FactStatus.SUPERSEDED, supersededAt: new Date() },
				});
			}

			await tx.contactFact.update({
				where: { id: fact.id },
				data: {
					status: accepted ? FactStatus.APPLIED : FactStatus.DISMISSED,
					decidedById: userId,
					decidedAt: new Date(),
				},
			});

			if (accepted && column) {
				await tx.contact.update({
					where: { id: fact.contactId },
					data: { [column]: fact.value },
				});
			}

			if (accepted && fact.field === "name") {
				const [firstName, ...rest] = fact.value.trim().split(/\s+/);
				if (firstName) {
					await tx.contact.update({
						where: { id: fact.contactId },
						data: {
							firstName,
							lastName: rest.length > 0 ? rest.join(" ") : null,
						},
					});
				}
			}
		});

		this.logger.log({
			message: "Fact decided",
			factId: fact.id,
			contactId: fact.contactId,
			field: fact.field,
			decision: input.decision,
		});

		return { contactId: fact.contactId, field: fact.field, applied: accepted };
	}

	/** `q` matches a name, an email address, or where they work. */
	private searchFilter(q: string): Prisma.ContactWhereInput {
		const term = q.trim();
		if (!term) return {};

		return {
			OR: [
				{ firstName: { contains: term, mode: "insensitive" } },
				{ lastName: { contains: term, mode: "insensitive" } },
				{ email: { contains: term, mode: "insensitive" } },
				{ company: { name: { contains: term, mode: "insensitive" } } },
			],
		};
	}

	private buildWhere(input: ContactListInput): Prisma.ContactWhereInput {
		const where: Prisma.ContactWhereInput = {
			...this.searchFilter(input.q),
			...ownerFilter(input.owner),
			archivedAt: null,
		};

		if (input.company !== FACET_ALL) {
			where.companyId = input.company === NO_COMPANY ? null : input.company;
		}

		if (input.source !== FACET_ALL) {
			where.source = input.source as RecordSource;
		}

		return where;
	}

	/** Counts against the search term only — see `CompaniesService.facetCounts`. */
	private async facetCounts(
		input: ContactListInput,
		scope: Prisma.ContactWhereInput,
	) {
		const where: Prisma.ContactWhereInput = {
			AND: [{ ...this.searchFilter(input.q), archivedAt: null }, scope],
		};

		const [owners, companies, sources] = await Promise.all([
			this.db.contact.groupBy({
				by: ["ownerId"],
				where,
				_count: { _all: true },
			}),
			this.db.contact.groupBy({
				by: ["companyId"],
				where,
				_count: { _all: true },
			}),
			this.db.contact.groupBy({
				by: ["source"],
				where,
				_count: { _all: true },
			}),
		]);

		return {
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			company: countsByKey(companies, "companyId", NO_COMPANY),
			source: countsByKey(sources, "source"),
		};
	}

	private async requireScoped(
		id: string,
		scope: Prisma.ContactWhereInput,
	): Promise<void> {
		const record = await this.db.contact.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true },
		});
		if (!record) throw new NotFoundException(`No contact with id ${id}.`);
	}

	private translate(error: unknown, id: string): unknown {
		if (error instanceof PrismaNamespace.PrismaClientKnownRequestError) {
			if (error.code === "P2025") {
				return new NotFoundException(`No contact with id ${id}.`);
			}
			if (error.code === "P2002") {
				return new ConflictException(
					"Another contact already uses that email address.",
				);
			}
		}
		return error;
	}
}
