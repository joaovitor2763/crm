import {
	ActivityType,
	type Db,
	type Prisma,
	Prisma as PrismaNamespace,
} from "@crm/db";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { ActivityStampService } from "../crm/activity-stamp.service";
import { fromCents, toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { lockPipelines } from "../pipelines/pipeline-locks";
import {
	readStringArray,
	stagePolicyEnabled,
} from "../pipelines/pipeline-persistence";
import {
	countsByKey,
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import { isClosedStage, isLosingStage } from "./deal-stage";
import type {
	ClosingWindow,
	DealCreateInput,
	DealListInput,
	DealUpdateInput,
	SetStageInput,
} from "./deals.contracts";
import { CLOSING_WINDOWS } from "./deals.contracts";

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
} as const;

const STAGE_SELECT = {
	id: true,
	key: true,
	name: true,
	position: true,
	type: true,
	semanticPhase: true,
	allowedRoleKeys: true,
	responsibleRoleKey: true,
	defaultResponsibleRoleKey: true,
	allowedNextStageIds: true,
} as const;

const PIPELINE_SELECT = {
	id: true,
	name: true,
	funnelType: true,
	blueprintVersion: true,
} as const;

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.DealOrderByWithRelationInput[]
> = {
	name: (dir) => [{ name: dir }],
	company: (dir) => [{ company: { name: dir } }, { name: "asc" }],
	stage: (dir) => [
		{ pipeline: { name: "asc" } },
		{ stage: { position: dir } },
		{ expectedCloseDate: "asc" },
	],
	amount: (dir) => [{ amount: dir }],
	expectedCloseDate: (dir) => [{ expectedCloseDate: dir }],
	createdAt: (dir) => [{ createdAt: dir }],
	owner: (dir) => [{ owner: { name: dir } }, { name: "asc" }],
	lastActivity: (dir) => [{ lastActivityAt: { sort: dir, nulls: "last" } }],
};

@Injectable()
export class DealsService {
	private readonly logger = new Logger(DealsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly stamp: ActivityStampService,
	) {}

	async list(input: DealListInput, scope: Prisma.DealWhereInput = {}) {
		const where: Prisma.DealWhereInput = {
			AND: [this.buildWhere(input), scope],
		};
		const { skip, take } = paginate(input);

		const [rows, total, facetCounts, openValue] = await Promise.all([
			this.db.deal.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, [{ createdAt: "desc" }]),
				select: {
					id: true,
					name: true,
					stage: { select: STAGE_SELECT },
					pipeline: { select: PIPELINE_SELECT },
					amount: true,
					currency: true,
					expectedCloseDate: true,
					closedAt: true,
					company: { select: COMPANY_SELECT },
					owner: { select: OWNER_SELECT },
					lastActivityAt: true,
					createdAt: true,
				},
			}),
			this.db.deal.count({ where }),
			this.facetCounts(input, scope),
			this.db.deal.aggregate({
				where: { ...where, stage: { type: "OPEN" } },
				_sum: { amount: true },
			}),
		]);

		return {
			rows: rows.map(
				({
					amount,
					expectedCloseDate,
					closedAt,
					lastActivityAt,
					createdAt,
					...row
				}) => ({
					...row,
					amountCents: toCents(amount),
					expectedCloseDate: expectedCloseDate?.toISOString() ?? null,
					closedAt: closedAt?.toISOString() ?? null,
					lastActivityAt: lastActivityAt?.toISOString() ?? null,
					createdAt: createdAt.toISOString(),
				}),
			),
			total,
			facetCounts,
			openValueCents: toCents(openValue._sum.amount),
		} satisfies ListResult<unknown> & { openValueCents: number | null };
	}

	async board(
		input: { q: string; owner: string; pipeline: string },
		scope: Prisma.DealWhereInput = {},
		pipelineScope: Prisma.PipelineWhereInput = {},
	) {
		const pipeline = await this.db.pipeline.findFirst({
			where: {
				AND: [
					input.pipeline === FACET_ALL
						? { isDefault: true, archivedAt: null }
						: { id: input.pipeline, archivedAt: null },
					pipelineScope,
				],
			},
			orderBy: { businessUnitId: { sort: "desc", nulls: "last" } },
			select: {
				id: true,
				name: true,
				stages: {
					orderBy: { position: "asc" },
					select: STAGE_SELECT,
				},
			},
		});
		if (!pipeline)
			throw new NotFoundException("No active pipeline is available.");

		const where: Prisma.DealWhereInput = {
			AND: [this.searchFilter(input.q), scope],
			pipelineId: pipeline.id,
			archivedAt: null,
		};
		if (input.owner !== FACET_ALL) {
			where.ownerId =
				input.owner === FACET_UNASSIGNED ? { in: [] } : input.owner;
		}

		const deals = await this.db.deal.findMany({
			where,
			orderBy: [
				{ stage: { position: "asc" } },
				{ expectedCloseDate: { sort: "asc", nulls: "last" } },
				{ createdAt: "desc" },
			],
			take: 1001,
			select: {
				id: true,
				name: true,
				stage: { select: STAGE_SELECT },
				amount: true,
				currency: true,
				expectedCloseDate: true,
				company: { select: COMPANY_SELECT },
				owner: { select: OWNER_SELECT },
			},
		});

		return {
			pipeline,
			truncated: deals.length > 1000,
			deals: deals
				.slice(0, 1000)
				.map(({ amount, expectedCloseDate, ...deal }) => ({
					...deal,
					amountCents: toCents(amount),
					expectedCloseDate: expectedCloseDate?.toISOString() ?? null,
				})),
		};
	}

	async byId(
		id: string,
		scope: Prisma.DealWhereInput = {},
		companyScope: Prisma.CompanyWhereInput = {},
		contactScope: Prisma.ContactWhereInput = {},
	) {
		const deal = await this.db.deal.findFirst({
			where: { AND: [{ id }, scope] },
			select: {
				id: true,
				name: true,
				stage: { select: STAGE_SELECT },
				pipeline: { select: PIPELINE_SELECT },
				stageChangedAt: true,
				amount: true,
				currency: true,
				expectedCloseDate: true,
				closedAt: true,
				closedReason: true,
				archivedAt: true,
				createdAt: true,
				company: { select: { ...COMPANY_SELECT, industry: true } },
				owner: { select: OWNER_SELECT },
				contacts: {
					where: {
						contact: { AND: [{ archivedAt: null }, contactScope] },
					},
					select: {
						role: true,
						contact: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								email: true,
								title: true,
							},
						},
					},
				},
				lineItems: {
					orderBy: { createdAt: "asc" },
					select: {
						id: true,
						productId: true,
						sku: true,
						name: true,
						unitPrice: true,
						currency: true,
						quantity: true,
					},
				},
			},
		});

		if (!deal) throw new NotFoundException(`No deal with id ${id}.`);
		const visibleCompany = await this.db.company.findFirst({
			where: { AND: [{ id: deal.company.id }, companyScope] },
			select: { id: true },
		});
		const { contacts, amount, lineItems, company, ...rest } = deal;
		return {
			...rest,
			company: visibleCompany ? company : null,
			amountCents: toCents(amount),
			stageChangedAt: deal.stageChangedAt.toISOString(),
			expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			closedAt: deal.closedAt?.toISOString() ?? null,
			createdAt: deal.createdAt.toISOString(),
			contacts: contacts.map(({ role, contact }) => ({ ...contact, role })),
			lineItems: lineItems.map(({ unitPrice, ...item }) => ({
				...item,
				unitPriceCents: toCents(unitPrice) ?? 0,
			})),
		};
	}

	async archived(scope: Prisma.DealWhereInput = {}) {
		const rows = await this.db.deal.findMany({
			where: { AND: [{ archivedAt: { not: null } }, scope] },
			orderBy: { archivedAt: "desc" },
			select: {
				id: true,
				name: true,
				archivedAt: true,
				company: { select: { id: true, name: true } },
				pipeline: { select: { id: true, name: true, archivedAt: true } },
			},
		});
		return rows.map(({ archivedAt, pipeline, ...row }) => ({
			...row,
			archivedAt: archivedAt?.toISOString() ?? null,
			pipeline: {
				id: pipeline.id,
				name: pipeline.name,
				archived: pipeline.archivedAt !== null,
			},
		}));
	}

	async assignment(id: string, scope: Prisma.DealWhereInput = {}) {
		const deal = await this.db.deal.findFirst({
			where: { AND: [{ id }, scope] },
			select: {
				id: true,
				businessUnitId: true,
				teamId: true,
				ownerId: true,
			},
		});
		if (!deal) throw new NotFoundException(`No deal with id ${id}.`);
		return deal;
	}

	async create(input: DealCreateInput) {
		const businessUnitId = input.businessUnitId ?? "business-unit-default";
		const candidate = await this.resolveInitialStage(
			input.pipelineId,
			input.stageId,
			this.db,
			businessUnitId,
		);
		try {
			const result = await this.db.$transaction(async (tx) => {
				await lockPipelines(tx, [candidate.pipelineId]);
				const stage = await this.resolveInitialStage(
					candidate.pipelineId,
					input.stageId,
					tx,
					businessUnitId,
				);
				const now = new Date();
				const deal = await tx.deal.create({
					data: {
						name: input.name.trim(),
						companyId: input.companyId,
						ownerId: input.ownerId,
						businessUnitId,
						teamId: input.teamId ?? null,
						customValues: (input.customValues ?? {}) as Prisma.InputJsonObject,
						pipelineId: stage.pipelineId,
						stageId: stage.id,
						stageChangedAt: now,
						closedAt: isClosedStage(stage.type) ? now : null,
						amount: fromCents(input.amountCents),
						currency: input.currency?.toUpperCase() ?? "USD",
						expectedCloseDate: parseDate(input.expectedCloseDate),
					},
					select: { id: true, name: true, companyId: true },
				});
				return { deal, stageId: stage.id };
			});
			this.logger.log({
				message: "Deal created",
				dealId: result.deal.id,
				stageId: result.stageId,
			});
			return result.deal;
		} catch (error) {
			throw this.translateRelations(error);
		}
	}

	async update(
		id: string,
		input: DealUpdateInput,
		scope: Prisma.DealWhereInput = {},
	) {
		await this.requireScoped(id, scope);
		const data: Prisma.DealUpdateInput = {};
		if (input.name !== undefined) data.name = input.name.trim();
		if (input.companyId !== undefined)
			data.company = { connect: { id: input.companyId } };
		if (input.ownerId !== undefined)
			data.owner = { connect: { id: input.ownerId } };
		if (input.amountCents !== undefined)
			data.amount = fromCents(input.amountCents);
		if (input.currency !== undefined)
			data.currency = input.currency.toUpperCase();
		if (input.expectedCloseDate !== undefined) {
			data.expectedCloseDate = parseDate(input.expectedCloseDate);
		}

		try {
			return await this.db.deal.update({
				where: { id },
				data,
				select: { id: true, name: true },
			});
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async setStage(
		input: SetStageInput,
		actingUserId: string,
		actingRoleKey?: string,
	) {
		const locatedTarget = await this.db.pipelineStage.findUnique({
			where: { id: input.stageId },
			select: {
				pipelineId: true,
				pipeline: {
					select: { businessUnitId: true, blueprintVersion: true },
				},
			},
		});
		if (!locatedTarget)
			throw new NotFoundException(`No stage with id ${input.stageId}.`);
		const locatedDeal = await this.db.deal.findUnique({
			where: { id: input.id },
			select: { pipelineId: true, businessUnitId: true, teamId: true },
		});
		if (!locatedDeal)
			throw new NotFoundException(`No deal with id ${input.id}.`);
		if (
			locatedTarget.pipeline.businessUnitId !== null &&
			locatedTarget.pipeline.businessUnitId !== locatedDeal.businessUnitId
		) {
			throw new BadRequestException(
				"That pipeline belongs to another business unit.",
			);
		}

		const closedReason = input.closedReason?.trim();

		const result = await this.db.$transaction(async (tx) => {
			await lockPipelines(tx, [
				locatedDeal.pipelineId,
				locatedTarget.pipelineId,
			]);
			const lockedDeals = await tx.$queryRaw<Array<{ pipelineId: string }>>`
				SELECT "pipelineId"
				FROM "deal"
				WHERE "id" = ${input.id}
				FOR UPDATE
			`;
			const lockedDeal = lockedDeals[0];
			if (!lockedDeal)
				throw new NotFoundException(`No deal with id ${input.id}.`);
			if (lockedDeal.pipelineId !== locatedDeal.pipelineId) {
				throw new ConflictException(
					"This deal changed while you were editing it. Refresh and try again.",
				);
			}
			const target = await tx.pipelineStage.findFirst({
				where: { id: input.stageId, pipeline: { archivedAt: null } },
				select: {
					...STAGE_SELECT,
					pipelineId: true,
					pipeline: { select: PIPELINE_SELECT },
				},
			});
			if (!target)
				throw new NotFoundException(`No stage with id ${input.stageId}.`);
			const deal = await tx.deal.findUnique({
				where: { id: input.id },
				select: {
					id: true,
					companyId: true,
					businessUnitId: true,
					teamId: true,
					pipelineId: true,
					archivedAt: true,
					closedAt: true,
					stage: { select: STAGE_SELECT },
					pipeline: { select: PIPELINE_SELECT },
				},
			});
			if (!deal) throw new NotFoundException(`No deal with id ${input.id}.`);
			if (deal.archivedAt) {
				throw new BadRequestException(
					"Restore this deal before changing its stage.",
				);
			}
			if (deal.stage.id === target.id) {
				return {
					id: deal.id,
					stage: deal.stage,
					changed: false as const,
					companyId: deal.companyId,
					fromStageId: deal.stage.id,
					changedAt: null,
				};
			}

			if (deal.pipelineId === target.pipelineId) {
				const version = await tx.pipelineBlueprintVersion.findUnique({
					where: {
						pipelineId_version: {
							pipelineId: deal.pipelineId,
							version: deal.pipeline.blueprintVersion,
						},
					},
					select: {
						handoverRules: {
							select: {
								fromStageId: true,
								toStageId: true,
								fromRoleKey: true,
								toRoleKey: true,
								acceptanceRequired: true,
								acceptanceSlaMinutes: true,
								assignmentStrategy: true,
							},
						},
					},
				});
				if (version) {
					validatePersistedTransition(
						deal.stage,
						target,
						version.handoverRules,
						input,
						actingRoleKey,
					);
				}
			}
			if (isLosingStage(target.type) && !closedReason) {
				throw new BadRequestException(
					"Say why it was lost or unqualified before moving it there.",
				);
			}

			const now = new Date();
			const closed = isClosedStage(target.type);
			const update = await tx.deal.updateMany({
				where: {
					id: deal.id,
					pipelineId: deal.pipelineId,
					stageId: deal.stage.id,
					archivedAt: null,
				},
				data: {
					pipelineId: target.pipelineId,
					stageId: target.id,
					stageChangedAt: now,
					closedAt: closed ? (deal.closedAt ?? now) : null,
					closedReason: isLosingStage(target.type) ? closedReason : null,
				},
			});
			if (update.count !== 1) {
				throw new ConflictException(
					"This deal changed while you were editing it. Refresh and try again.",
				);
			}

			await tx.activity.create({
				data: {
					type: ActivityType.STAGE_CHANGE,
					subject: "Stage changed",
					body: closedReason ?? null,
					occurredAt: now,
					companyId: deal.companyId,
					dealId: deal.id,
					businessUnitId: deal.businessUnitId,
					teamId: deal.teamId,
					createdById: actingUserId,
					meta: {
						from: deal.stage.name,
						fromId: deal.stage.id,
						fromPipeline: deal.pipeline.name,
						to: target.name,
						toId: target.id,
						toPipeline: target.pipeline.name,
						...(input.handoverAccepted !== undefined || input.handoverToRole
							? {
									handoverAccepted: input.handoverAccepted ?? false,
									handoverToRole: input.handoverToRole ?? null,
									actingRole: actingRoleKey ?? null,
								}
							: {}),
					},
				},
			});

			return {
				id: deal.id,
				stage: {
					id: target.id,
					name: target.name,
					position: target.position,
					type: target.type,
				},
				changed: true as const,
				companyId: deal.companyId,
				fromStageId: deal.stage.id,
				changedAt: now,
			};
		});

		if (!result.changed || !result.changedAt) {
			return { id: result.id, stage: result.stage, changed: false };
		}
		await this.stamp.touch(
			{ companyId: result.companyId, dealId: result.id },
			result.changedAt,
		);
		this.logger.log({
			message: "Deal stage changed",
			dealId: result.id,
			fromStageId: result.fromStageId,
			toStageId: result.stage.id,
		});
		return { id: result.id, stage: result.stage, changed: true };
	}

	async archive(id: string, scope: Prisma.DealWhereInput = {}) {
		await this.requireScoped(id, scope);
		try {
			return await this.db.deal.update({
				where: { id },
				data: { archivedAt: new Date() },
				select: { id: true, archivedAt: true },
			});
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async restore(id: string, scope: Prisma.DealWhereInput = {}) {
		await this.requireScoped(id, scope);
		const located = await this.db.deal.findUnique({
			where: { id },
			select: { pipelineId: true },
		});
		if (!located) throw new NotFoundException(`No deal with id ${id}.`);
		try {
			return await this.db.$transaction(async (tx) => {
				await lockPipelines(tx, [located.pipelineId]);
				const deal = await tx.deal.findUnique({
					where: { id },
					select: { pipeline: { select: { archivedAt: true } } },
				});
				if (!deal) throw new NotFoundException(`No deal with id ${id}.`);
				if (deal.pipeline.archivedAt) {
					throw new BadRequestException(
						"Restore this deal's pipeline before restoring the deal.",
					);
				}
				return tx.deal.update({
					where: { id },
					data: { archivedAt: null },
					select: { id: true, archivedAt: true },
				});
			});
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async addLineItem(
		input: {
			dealId: string;
			productId: string;
			quantity: number;
		},
		scope: Prisma.DealWhereInput = {},
	) {
		const deal = await this.db.deal.findFirst({
			where: { AND: [{ id: input.dealId }, scope] },
			select: { archivedAt: true },
		});
		if (!deal) throw new NotFoundException(`No deal with id ${input.dealId}.`);
		if (deal.archivedAt) {
			throw new BadRequestException(
				"Restore this deal before changing its products.",
			);
		}
		const product = await this.db.product.findFirst({
			where: { id: input.productId, archivedAt: null },
			select: { id: true, sku: true, name: true, price: true, currency: true },
		});
		if (!product) throw new NotFoundException("That product is not available.");
		try {
			return await this.db.dealLineItem.create({
				data: {
					dealId: input.dealId,
					productId: product.id,
					sku: product.sku,
					name: product.name,
					unitPrice: product.price,
					currency: product.currency,
					quantity: input.quantity,
				},
				select: { id: true },
			});
		} catch (error) {
			throw this.translateRelations(error);
		}
	}

	async updateLineItem(
		input: { id: string; quantity: number },
		scope: Prisma.DealWhereInput = {},
	) {
		const update = await this.db.dealLineItem.updateMany({
			where: { id: input.id, deal: { AND: [{ archivedAt: null }, scope] } },
			data: { quantity: input.quantity },
		});
		if (update.count !== 1) {
			throw new NotFoundException(`No line item with id ${input.id}.`);
		}
		return { id: input.id };
	}

	async removeLineItem(id: string, scope: Prisma.DealWhereInput = {}) {
		const removal = await this.db.dealLineItem.deleteMany({
			where: { id, deal: { AND: [{ archivedAt: null }, scope] } },
		});
		if (removal.count !== 1) {
			throw new NotFoundException(`No line item with id ${id}.`);
		}
		return { id };
	}

	private async resolveInitialStage(
		pipelineId?: string,
		stageId?: string,
		client: Pick<Prisma.TransactionClient, "pipeline" | "pipelineStage"> = this
			.db,
		businessUnitId = "business-unit-default",
	) {
		if (stageId) {
			const stage = await client.pipelineStage.findFirst({
				where: {
					id: stageId,
					pipeline: {
						archivedAt: null,
						OR: [{ businessUnitId: null }, { businessUnitId }],
					},
				},
				select: { id: true, pipelineId: true, type: true },
			});
			if (!stage || (pipelineId && stage.pipelineId !== pipelineId)) {
				throw new BadRequestException(
					"That stage does not belong to the selected pipeline.",
				);
			}
			if (stage.type !== "OPEN") {
				throw new BadRequestException(
					"A new deal must start in an open stage.",
				);
			}
			return stage;
		}
		const pipeline = await client.pipeline.findFirst({
			where: pipelineId
				? {
						id: pipelineId,
						archivedAt: null,
						OR: [{ businessUnitId: null }, { businessUnitId }],
					}
				: {
						isDefault: true,
						archivedAt: null,
						OR: [{ businessUnitId }, { businessUnitId: null }],
					},
			orderBy: { businessUnitId: { sort: "desc", nulls: "last" } },
			select: {
				id: true,
				stages: {
					where: { type: "OPEN" },
					orderBy: { position: "asc" },
					take: 1,
					select: { id: true, pipelineId: true, type: true },
				},
			},
		});
		const first = pipeline?.stages[0];
		if (!first)
			throw new BadRequestException(
				"The selected pipeline has no open stages.",
			);
		return first;
	}

	private searchFilter(q: string): Prisma.DealWhereInput {
		const term = q.trim();
		if (!term) return {};
		return {
			OR: [
				{ name: { contains: term, mode: "insensitive" } },
				{ company: { name: { contains: term, mode: "insensitive" } } },
			],
		};
	}

	private buildWhere(input: DealListInput): Prisma.DealWhereInput {
		const where: Prisma.DealWhereInput = {
			...this.searchFilter(input.q),
			archivedAt: null,
		};
		if (input.owner !== FACET_ALL) {
			where.ownerId =
				input.owner === FACET_UNASSIGNED ? { in: [] } : input.owner;
		}
		if (input.stage === FACET_ALL) {
			if (input.status === "open") where.stage = { type: "OPEN" };
			else if (input.status === "closed")
				where.stage = { type: { not: "OPEN" } };
		}
		if (input.stage !== FACET_ALL) where.stageId = input.stage;
		if (input.pipeline !== FACET_ALL) where.pipelineId = input.pipeline;
		if (input.closing !== FACET_ALL) {
			Object.assign(where, closingFilter(input.closing as ClosingWindow));
		}
		return where;
	}

	private async facetCounts(
		input: DealListInput,
		scope: Prisma.DealWhereInput,
	) {
		const where: Prisma.DealWhereInput = {
			AND: [{ ...this.searchFilter(input.q), archivedAt: null }, scope],
		};
		const [
			owners,
			stages,
			pipelines,
			stageRecords,
			open,
			closed,
			...closingCounts
		] = await Promise.all([
			this.db.deal.groupBy({ by: ["ownerId"], where, _count: { _all: true } }),
			this.db.deal.groupBy({ by: ["stageId"], where, _count: { _all: true } }),
			this.db.deal.groupBy({
				by: ["pipelineId"],
				where,
				_count: { _all: true },
			}),
			this.db.pipelineStage.findMany({
				where:
					input.pipeline === FACET_ALL ? {} : { pipelineId: input.pipeline },
				select: { id: true },
			}),
			this.db.deal.count({ where: { ...where, stage: { type: "OPEN" } } }),
			this.db.deal.count({
				where: { ...where, stage: { type: { not: "OPEN" } } },
			}),
			...CLOSING_WINDOWS.map((window) =>
				this.db.deal.count({ where: { ...where, ...closingFilter(window) } }),
			),
		]);
		const allStageCounts = countsByKey(stages, "stageId");
		return {
			status: { open, closed },
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			pipeline: countsByKey(pipelines, "pipelineId"),
			stage: Object.fromEntries(
				stageRecords.map((stage) => [stage.id, allStageCounts[stage.id] ?? 0]),
			),
			closing: Object.fromEntries(
				CLOSING_WINDOWS.map((window, index) => [
					window,
					closingCounts[index] ?? 0,
				]),
			),
		};
	}

	private async requireScoped(
		id: string,
		scope: Prisma.DealWhereInput,
	): Promise<void> {
		const record = await this.db.deal.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true },
		});
		if (!record) throw new NotFoundException(`No deal with id ${id}.`);
	}

	private translate(error: unknown, id: string): unknown {
		if (
			error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			error.code === "P2025"
		) {
			return new NotFoundException(`No deal with id ${id}.`);
		}
		return this.translateRelations(error);
	}

	private translateRelations(error: unknown): unknown {
		if (
			error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			(error.code === "P2003" || error.code === "P2025")
		) {
			return new BadRequestException(
				"That company, owner, pipeline, stage or product no longer exists.",
			);
		}
		return error;
	}
}

type PersistedTransitionStage = {
	id: string;
	allowedRoleKeys: Prisma.JsonValue;
	responsibleRoleKey: string | null;
	defaultResponsibleRoleKey: string | null;
	allowedNextStageIds: Prisma.JsonValue;
};

type PersistedHandover = {
	fromStageId: string;
	toStageId: string;
	fromRoleKey: string;
	toRoleKey: string;
	acceptanceRequired: boolean;
	acceptanceSlaMinutes: number | null;
	assignmentStrategy: string;
};

function validatePersistedTransition(
	from: PersistedTransitionStage,
	to: PersistedTransitionStage,
	rules: PersistedHandover[],
	input: SetStageInput,
	actingRoleKey?: string,
) {
	if (
		!stagePolicyEnabled(from) &&
		!stagePolicyEnabled(to) &&
		rules.length === 0
	) {
		return;
	}
	const allowedNextStageIds = readStringArray(from.allowedNextStageIds);
	if (allowedNextStageIds.length > 0 && !allowedNextStageIds.includes(to.id)) {
		throw new BadRequestException(
			"The target stage is not allowed from the current stage.",
		);
	}
	const allowedRoles = readStringArray(from.allowedRoleKeys);
	if (
		actingRoleKey &&
		allowedRoles.length > 0 &&
		!allowedRoles.includes(actingRoleKey)
	) {
		throw new BadRequestException(
			"The acting role is not allowed on the current stage.",
		);
	}
	const rule = rules.find(
		(candidate) =>
			candidate.fromStageId === from.id && candidate.toStageId === to.id,
	);
	const roleChanged =
		from.responsibleRoleKey !== null &&
		to.responsibleRoleKey !== null &&
		from.responsibleRoleKey !== to.responsibleRoleKey;
	if (roleChanged && !rule) {
		throw new BadRequestException(
			"A role change requires an explicit handover rule.",
		);
	}
	if (!rule) {
		if (
			input.handoverToRole &&
			to.responsibleRoleKey &&
			input.handoverToRole !== to.responsibleRoleKey
		) {
			throw new BadRequestException(
				"The handover target role does not own the target stage.",
			);
		}
		return;
	}
	if (!actingRoleKey || actingRoleKey !== rule.fromRoleKey) {
		throw new BadRequestException(
			"The acting role does not own this handover.",
		);
	}
	if (input.handoverToRole && input.handoverToRole !== rule.toRoleKey) {
		throw new BadRequestException(
			"The handover target role does not match the configured rule.",
		);
	}
	if (rule.acceptanceRequired && input.handoverAccepted !== true) {
		throw new BadRequestException(
			"This handover must be explicitly accepted before the deal moves.",
		);
	}
}

function closingFilter(window: ClosingWindow): Prisma.DealWhereInput {
	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
	const startOfMonthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);
	switch (window) {
		case "overdue":
			return { expectedCloseDate: { lt: now }, stage: { type: "OPEN" } };
		case "this-month":
			return { expectedCloseDate: { gte: startOfMonth, lt: startOfNextMonth } };
		case "next-month":
			return {
				expectedCloseDate: { gte: startOfNextMonth, lt: startOfMonthAfter },
			};
		case "later":
			return { expectedCloseDate: { gte: startOfMonthAfter } };
		case "none":
			return { expectedCloseDate: null };
	}
}

function parseDate(value: string | null | undefined): Date | null {
	if (value === null || value === undefined || value === "") return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new BadRequestException(`"${value}" is not a date.`);
	}
	return date;
}
