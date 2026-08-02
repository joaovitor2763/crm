import {
	AuditActorType,
	type Db,
	type EnrichmentStatus,
	type Prisma,
	Prisma as PrismaNamespace,
	type RecordSource,
} from "@crm/db";
import {
	BadRequestException,
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
	CompanyCreateInput,
	CompanyListInput,
	CompanyUpdateInput,
} from "./companies.contracts";
import { normalizeDomain } from "./domain";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

/** One row of the companies table. */
export type CompanyRow = {
	id: string;
	name: string;
	domain: string | null;
	iconUrl: string | null;
	iconDarkUrl: string | null;
	iconTone: string | null;
	logoUrl: string | null;
	brandColor: string | null;
	industry: string | null;
	enrichmentStatus: EnrichmentStatus;
	/**
	 * Whether the agent actually has this company on its list.
	 *
	 * Separate from `enrichmentStatus` because that column defaults to PENDING
	 * and so cannot tell "waiting its turn" from "nobody ever asked".
	 */
	queued: boolean;
	source: RecordSource;
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	contactCount: number;
	openDealCount: number;
	/** ISO-8601, or null when nothing has happened yet. */
	lastActivityAt: string | null;
	createdAt: string;
};

/**
 * Columns `?sort=` may name, and the Prisma ordering each one means.
 *
 * Spelled out rather than derived from the column id so `?sort=` can never
 * reach Prisma as an arbitrary field name — and because ordering by a relation
 * count is not a flat `{ [id]: dir }`.
 */
const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.CompanyOrderByWithRelationInput
> = {
	name: (dir) => ({ name: dir }),
	domain: (dir) => ({ domain: dir }),
	industry: (dir) => ({ industry: dir }),
	createdAt: (dir) => ({ createdAt: dir }),
	contacts: (dir) => ({ contacts: { _count: dir } }),
	deals: (dir) => ({ deals: { _count: dir } }),
	// By the owner's name, not their id — nobody scans a list of cuids.
	// Unassigned rows sort last either way: they are the least interesting.
	owner: (dir) => ({ owner: { name: dir } }),
	// A real column, so this is an index scan. Never-touched rows sort last in
	// both directions, because "no activity" is not "the oldest activity".
	lastActivity: (dir) => ({ lastActivityAt: { sort: dir, nulls: "last" } }),
};

@Injectable()
export class CompaniesService {
	private readonly logger = new Logger(CompaniesService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly queue: AgentQueueService,
	) {}

	async list(
		input: CompanyListInput,
		scope: Prisma.CompanyWhereInput = {},
		contactScope: Prisma.ContactWhereInput = {},
		dealScope: Prisma.DealWhereInput = {},
	): Promise<ListResult<CompanyRow>> {
		const where: Prisma.CompanyWhereInput = {
			AND: [this.buildWhere(input), scope],
		};
		const { skip, take } = paginate(input);

		const [rows, total, facetCounts] = await Promise.all([
			this.db.company.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, {
					createdAt: "desc",
				}),
				select: {
					id: true,
					name: true,
					domain: true,
					iconUrl: true,
					iconDarkUrl: true,
					iconTone: true,
					logoUrl: true,
					brandColor: true,
					industry: true,
					enrichmentStatus: true,
					source: true,
					owner: { select: OWNER_SELECT },
					_count: {
						select: {
							contacts: {
								where: { AND: [{ archivedAt: null }, contactScope] },
							},
							deals: {
								where: {
									AND: [
										{ archivedAt: null, stage: { type: "OPEN" } },
										dealScope,
									],
								},
							},
						},
					},
					lastActivityAt: true,
					createdAt: true,
				},
			}),
			this.db.company.count({ where }),
			this.facetCounts(input, scope),
		]);

		// After the page is known, so it is one query for the rows on screen
		// rather than a join that would have to be repeated for the facet counts.
		const queued = await this.queue.queuedCompanies(rows.map((row) => row.id));

		return {
			rows: rows.map((row) => ({
				id: row.id,
				name: row.name,
				domain: row.domain,
				iconUrl: row.iconUrl,
				iconDarkUrl: row.iconDarkUrl,
				iconTone: row.iconTone,
				logoUrl: row.logoUrl,
				brandColor: row.brandColor,
				industry: row.industry,
				enrichmentStatus: row.enrichmentStatus,
				queued: queued.has(row.id),
				source: row.source,
				owner: row.owner,
				contactCount: row._count.contacts,
				openDealCount: row._count.deals,
				lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
				createdAt: row.createdAt.toISOString(),
			})),
			total,
			facetCounts,
		};
	}

	async byId(
		id: string,
		scope: Prisma.CompanyWhereInput = {},
		contactScope: Prisma.ContactWhereInput = {},
		dealScope: Prisma.DealWhereInput = {},
	) {
		const company = await this.db.company.findFirst({
			where: { AND: [{ id }, scope] },
			select: {
				id: true,
				name: true,
				domain: true,
				website: true,
				description: true,
				logoUrl: true,
				logoDarkUrl: true,
				iconUrl: true,
				iconDarkUrl: true,
				iconTone: true,
				brandColor: true,
				industry: true,
				subIndustry: true,
				city: true,
				stateCode: true,
				country: true,
				countryCode: true,
				phone: true,
				email: true,
				linkedinUrl: true,
				twitterUrl: true,
				githubUrl: true,
				pricingUrl: true,
				careersUrl: true,
				enrichmentStatus: true,
				enrichedAt: true,
				enrichmentError: true,
				source: true,
				archivedAt: true,
				createdAt: true,
				owner: { select: OWNER_SELECT },
				primaryContact: {
					where: contactScope,
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						phone: true,
						title: true,
					},
				},
				contacts: {
					where: { AND: [{ archivedAt: null }, contactScope] },
					orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						title: true,
						owner: { select: OWNER_SELECT },
					},
				},
				deals: {
					where: { AND: [{ archivedAt: null }, dealScope] },
					orderBy: [
						{ stage: { position: "asc" } },
						{ expectedCloseDate: "asc" },
					],
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
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		const { deals, primaryContact, enrichedAt, createdAt, ...rest } = company;

		return {
			...rest,
			queued: await this.queue.isQueued({ companyId: id }),
			createdAt: createdAt.toISOString(),
			enrichedAt: enrichedAt?.toISOString() ?? null,
			primaryContactId: primaryContact?.id ?? null,
			primaryContact,
			deals: deals.map((deal) => ({
				...deal,
				amount: undefined,
				amountCents: toCents(deal.amount),
				expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			})),
		};
	}

	async archived(scope: Prisma.CompanyWhereInput = {}) {
		const rows = await this.db.company.findMany({
			where: { AND: [{ archivedAt: { not: null } }, scope] },
			orderBy: { archivedAt: "desc" },
			select: { id: true, name: true, domain: true, archivedAt: true },
		});
		return rows.map(({ archivedAt, ...row }) => ({
			...row,
			archivedAt: archivedAt?.toISOString() ?? null,
		}));
	}

	async assignments(id: string, scope: Prisma.CompanyWhereInput = {}) {
		const company = await this.db.company.findFirst({
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
		if (!company) throw new NotFoundException(`No company with id ${id}.`);
		return company;
	}

	/**
	 * Companies for a picker or a facet label — id, name and enough to draw the
	 * logo, nothing else.
	 *
	 * Capped at 100 and searchable, so the "which company?" dropdown on a contact
	 * or a deal stays a dropdown rather than becoming a second list view.
	 */
	async options(q: string, scope: Prisma.CompanyWhereInput = {}) {
		return this.db.company.findMany({
			where: { AND: [this.searchFilter(q), { archivedAt: null }, scope] },
			select: { id: true, name: true, domain: true, iconUrl: true },
			orderBy: { name: "asc" },
			take: 100,
		});
	}

	async create(input: CompanyCreateInput, actor?: EffectivePrincipal) {
		const domain = normalizeDomain(input.domain);

		if (domain) {
			const existing = await this.db.company.findUnique({
				where: { domain },
				select: { id: true, name: true },
			});
			if (existing) {
				throw new ConflictException(
					`${existing.name} already uses the domain ${domain}.`,
				);
			}
		}

		const businessUnitId = input.businessUnitId ?? DEFAULT_BUSINESS_UNIT_ID;
		const teamId = input.teamId === undefined ? DEFAULT_TEAM_ID : input.teamId;
		const company = await this.db.$transaction(async (tx) => {
			const created = await tx.company.create({
				data: {
					name: input.name.trim(),
					domain,
					website: domain ? `https://${domain}` : null,
					ownerId: input.ownerId ?? null,
					customValues: (input.customValues ?? {}) as Prisma.InputJsonObject,
					unitStates: {
						create: {
							businessUnitId,
							teamId,
							ownerId: input.ownerId ?? actor?.userId ?? null,
						},
					},
				},
				select: { id: true, name: true, domain: true },
			});
			await tx.domainEvent.create({
				data: {
					eventKey: `company.created:${created.id}`,
					type: "company.created",
					resource: "companies",
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

		this.logger.log({
			message: "Company created",
			companyId: company.id,
			domain: company.domain,
		});

		// Fire-and-forget: the create form should not wait on research, and the
		// detail page polls until it settles. All this says is that a company now
		// exists with nothing on it but a domain — what to do about that is the
		// agent's call.
		await this.agent.companyCreated(company.id);

		return company;
	}

	async update(
		id: string,
		input: CompanyUpdateInput,
		scope: Prisma.CompanyWhereInput = {},
	) {
		await this.requireScoped(id, scope);
		const data: Prisma.CompanyUpdateInput = {};

		if (input.name !== undefined) data.name = input.name.trim();
		if (input.website !== undefined) data.website = blankToNull(input.website);
		if (input.description !== undefined) {
			data.description = blankToNull(input.description);
		}
		if (input.industry !== undefined)
			data.industry = blankToNull(input.industry);
		if (input.city !== undefined) data.city = blankToNull(input.city);
		if (input.stateCode !== undefined) {
			data.stateCode = blankToNull(input.stateCode);
		}
		if (input.country !== undefined) data.country = blankToNull(input.country);
		if (input.phone !== undefined) data.phone = blankToNull(input.phone);
		if (input.email !== undefined) data.email = blankToNull(input.email);
		if (input.linkedinUrl !== undefined) {
			data.linkedinUrl = blankToNull(input.linkedinUrl);
		}
		if (input.ownerId !== undefined) {
			data.owner = input.ownerId
				? { connect: { id: input.ownerId } }
				: { disconnect: true };
		}

		if (input.domain !== undefined) {
			const domain = normalizeDomain(input.domain);
			if (input.domain.trim() && !domain) {
				throw new BadRequestException(
					`"${input.domain}" is not a domain — try something like "stripe.com".`,
				);
			}
			data.domain = domain;
			// A new domain means the enrichment we have is for the wrong company.
			// Phase 6 picks PENDING rows up; until then this is honest bookkeeping.
			const current = await this.db.company.findUnique({
				where: { id },
				select: { domain: true },
			});
			if (current && current.domain !== domain) {
				data.enrichmentStatus = "PENDING";
				data.enrichmentError = null;
			}
		}

		try {
			const updated = await this.db.company.update({
				where: { id },
				data,
				select: { id: true, name: true, domain: true },
			});

			if (data.enrichmentStatus === "PENDING") {
				await this.agent.companyCreated(
					id,
					"Domain changed — anything we knew was about a different company",
				);
			}

			return updated;
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async archive(id: string, scope: Prisma.CompanyWhereInput = {}) {
		await this.requireScoped(id, scope);
		try {
			return await this.db.company.update({
				where: { id },
				data: { archivedAt: new Date() },
				select: { id: true, archivedAt: true },
			});
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async restore(id: string, scope: Prisma.CompanyWhereInput = {}) {
		await this.requireScoped(id, scope);
		try {
			return await this.db.company.update({
				where: { id },
				data: { archivedAt: null },
				select: { id: true, archivedAt: true },
			});
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	/**
	 * The "Look this up again" button.
	 *
	 * Queues the work at the front and returns immediately. It no longer forces
	 * a vendor cache bypass, because the API no longer knows there is a vendor:
	 * a rep asking for a fresh look is an event, and how to honour it — which
	 * sources, how deep, whether the cached answer is still good — belongs to
	 * the agent.
	 */
	async enrich(
		id: string,
		scope: Prisma.CompanyWhereInput = {},
	): Promise<{ id: string; queued: boolean }> {
		const company = await this.db.company.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true },
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		await this.db.company.update({
			where: { id },
			data: { enrichmentStatus: "PENDING", enrichmentError: null },
		});
		await this.agent.companyRequested(id, "A rep asked for a fresh look");

		return { id, queued: true };
	}

	/** Asks the agent for a written brief on the company's timeline. */
	async research(
		id: string,
		actingUserId: string,
		scope: Prisma.CompanyWhereInput = {},
	) {
		const company = await this.db.company.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true, domain: true },
		});

		if (!company) {
			throw new NotFoundException(`No company with id ${id}.`);
		}

		if (!company.domain) {
			throw new BadRequestException(
				"There is nothing to read without a domain — add one first.",
			);
		}

		await this.agent.companyRequested(
			id,
			`Briefing requested by a rep (${actingUserId})`,
		);

		return { ok: true as const, queued: true as const };
	}

	/**
	 * Points a company at the person to call.
	 *
	 * The contact has to already belong to the company: a "primary contact" who
	 * works somewhere else is a data-entry accident, not a relationship.
	 */
	async setPrimaryContact(companyId: string, contactId: string | null) {
		if (contactId) {
			const contact = await this.db.contact.findUnique({
				where: { id: contactId },
				select: { companyId: true },
			});
			if (!contact) {
				throw new NotFoundException(`No contact with id ${contactId}.`);
			}
			if (contact.companyId !== companyId) {
				throw new BadRequestException(
					"That contact does not work at this company.",
				);
			}
		}

		try {
			return await this.db.company.update({
				where: { id: companyId },
				data: { primaryContactId: contactId },
				select: { id: true, primaryContactId: true },
			});
		} catch (error) {
			throw this.translate(error, companyId);
		}
	}

	/** `q` matches the name or the domain — the two things a rep would type. */
	private searchFilter(q: string): Prisma.CompanyWhereInput {
		const term = q.trim();
		if (!term) return {};

		return {
			OR: [
				{ name: { contains: term, mode: "insensitive" } },
				{ domain: { contains: term, mode: "insensitive" } },
			],
		};
	}

	private buildWhere(input: CompanyListInput): Prisma.CompanyWhereInput {
		const where: Prisma.CompanyWhereInput = {
			...this.searchFilter(input.q),
			...ownerFilter(input.owner),
			archivedAt: null,
		};

		if (input.industry !== FACET_ALL) {
			where.industry = input.industry;
		}

		if (input.enrichment !== FACET_ALL) {
			where.enrichmentStatus = input.enrichment as EnrichmentStatus;
		}

		if (input.source !== FACET_ALL) {
			where.source = input.source as RecordSource;
		}

		return where;
	}

	/**
	 * Counts for the facet dropdowns.
	 *
	 * Computed against the search term only, not the other facets: counts that
	 * shift every time you touch a different dropdown are hard to read, and
	 * options that vanish are worse.
	 */
	private async facetCounts(
		input: CompanyListInput,
		scope: Prisma.CompanyWhereInput,
	) {
		const where: Prisma.CompanyWhereInput = {
			AND: [{ ...this.searchFilter(input.q), archivedAt: null }, scope],
		};

		const [owners, industries, enrichment, sources] = await Promise.all([
			this.db.company.groupBy({
				by: ["ownerId"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["industry"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["enrichmentStatus"],
				where,
				_count: { _all: true },
			}),
			this.db.company.groupBy({
				by: ["source"],
				where,
				_count: { _all: true },
			}),
		]);

		return {
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			industry: countsByKey(industries, "industry"),
			enrichment: countsByKey(enrichment, "enrichmentStatus"),
			source: countsByKey(sources, "source"),
		};
	}

	private async requireScoped(
		id: string,
		scope: Prisma.CompanyWhereInput,
	): Promise<void> {
		const record = await this.db.company.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true },
		});
		if (!record) throw new NotFoundException(`No company with id ${id}.`);
	}

	/** Prisma's constraint errors, said in a way a rep can act on. */
	private translate(error: unknown, id: string): unknown {
		if (error instanceof PrismaNamespace.PrismaClientKnownRequestError) {
			if (error.code === "P2025") {
				return new NotFoundException(`No company with id ${id}.`);
			}
			if (error.code === "P2002") {
				return new ConflictException(
					"Another company already uses that domain.",
				);
			}
		}
		return error;
	}
}
