import {
	type Db,
	PipelineFunnelType as DbPipelineFunnelType,
	PipelineStageType,
	type Prisma,
	Prisma as PrismaNamespace,
} from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	type PipelineBlueprint,
	type PipelineFunnelType,
	type PipelineTransitionRequest,
	validateBlueprintTransition,
	validatePipelineBlueprint,
} from "./pipeline-blueprint";
import { lockDefaultPipeline, lockPipelines } from "./pipeline-locks";
import {
	fromDbFunnelType,
	type HandoverRuleRow,
	publicBlueprint,
	readStringArray,
	STAGE_POLICY_SELECT,
	type StagePolicyRow,
	snapshotFor,
	stageFromBlueprint,
	toDbFunnelType,
} from "./pipeline-persistence";

const STARTING_STAGES = [
	{
		key: "demo-booked",
		name: "Demo booked",
		type: PipelineStageType.OPEN,
		semanticPhase: "acquisition",
	},
	{
		key: "qualified-to-buy",
		name: "Qualified to buy",
		type: PipelineStageType.OPEN,
		semanticPhase: "qualification",
	},
	{
		key: "decision-maker-in",
		name: "Decision maker in",
		type: PipelineStageType.OPEN,
		semanticPhase: "evaluation",
	},
	{
		key: "contract-sent",
		name: "Contract sent",
		type: PipelineStageType.OPEN,
		semanticPhase: "negotiation",
	},
	{
		key: "closed-won",
		name: "Closed won",
		type: PipelineStageType.WON,
		semanticPhase: "closed_won",
	},
	{
		key: "closed-lost",
		name: "Closed lost",
		type: PipelineStageType.LOST,
		semanticPhase: "closed_lost",
	},
	{
		key: "unqualified",
		name: "Unqualified",
		type: PipelineStageType.UNQUALIFIED,
		semanticPhase: "disqualified",
	},
] as const;

const RULE_SELECT = {
	fromStageId: true,
	toStageId: true,
	fromRoleKey: true,
	toRoleKey: true,
	acceptanceRequired: true,
	acceptanceSlaMinutes: true,
	assignmentStrategy: true,
} as const;

type StageInput = {
	pipelineId: string;
	name: string;
	type: PipelineStageType;
	key?: string;
	semanticPhase?: string;
	allowedRoles?: string[];
	responsibleRole?: string;
	defaultResponsibleRole?: string;
	allowedNextStages?: string[];
};

type StageUpdateInput = {
	id: string;
	name?: string;
	type?: PipelineStageType;
	key?: string;
	semanticPhase?: string;
	allowedRoles?: string[];
	responsibleRole?: string | null;
	defaultResponsibleRole?: string | null;
	allowedNextStages?: string[];
};

@Injectable()
export class PipelinesService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async list(includeArchived = false, scope: Prisma.PipelineWhereInput = {}) {
		return this.db.pipeline.findMany({
			where: { AND: [includeArchived ? {} : { archivedAt: null }, scope] },
			orderBy: [{ isDefault: "desc" }, { name: "asc" }],
			select: {
				id: true,
				name: true,
				isDefault: true,
				archivedAt: true,
				businessUnitId: true,
				funnelType: true,
				blueprintVersion: true,
				businessUnit: { select: { id: true, name: true } },
				stages: {
					orderBy: { position: "asc" },
					select: {
						...STAGE_POLICY_SELECT,
						_count: { select: { deals: true } },
					},
				},
				_count: { select: { deals: true } },
			},
		});
	}

	async describe(id: string, scope: Prisma.PipelineWhereInput = {}) {
		const pipeline = await this.db.pipeline.findFirst({
			where: { AND: [{ id }, scope] },
			select: {
				id: true,
				name: true,
				businessUnitId: true,
				archivedAt: true,
				funnelType: true,
				blueprintVersion: true,
				stages: {
					orderBy: { position: "asc" },
					select: STAGE_POLICY_SELECT,
				},
			},
		});
		if (!pipeline) throw new NotFoundException(`No pipeline with id ${id}.`);
		const version = await this.db.pipelineBlueprintVersion.findUnique({
			where: {
				pipelineId_version: {
					pipelineId: id,
					version: pipeline.blueprintVersion,
				},
			},
			select: {
				id: true,
				version: true,
				funnelType: true,
				handoverRules: { select: RULE_SELECT },
			},
		});
		const blueprint = version
			? publicBlueprint(
					version.funnelType,
					pipeline.stages,
					version.handoverRules,
				)
			: null;
		return {
			...pipeline,
			type: fromDbFunnelType(pipeline.funnelType),
			typeSource: version
				? ("persisted" as const)
				: ("inferred_from_stage_outcomes" as const),
			blueprintVersion: version?.version ?? pipeline.blueprintVersion,
			blueprint,
			roles: {
				configured: blueprint !== null,
				message: blueprint
					? undefined
					: "Publish a blueprint to configure stage roles.",
			},
			handovers: {
				configured: blueprint !== null,
				rules: blueprint?.handovers ?? [],
			},
		};
	}

	validateBlueprint(blueprint: PipelineBlueprint) {
		return validatePipelineBlueprint(blueprint);
	}

	validateBlueprintTransition(
		blueprint: PipelineBlueprint,
		request: PipelineTransitionRequest,
	) {
		return validateBlueprintTransition(blueprint, request);
	}

	async create(
		name: string,
		businessUnitId: string | null = null,
		funnelType: PipelineFunnelType = "full_bowtie",
	) {
		try {
			return await this.db.$transaction(async (tx) => {
				await lockDefaultPipeline(tx);
				const active = await tx.pipeline.count({
					where: { archivedAt: null, businessUnitId },
				});
				const pipeline = await tx.pipeline.create({
					data: {
						name: name.trim(),
						isDefault: active === 0,
						businessUnitId,
						funnelType: toDbFunnelType(funnelType),
						stages: {
							create: STARTING_STAGES.map((stage, position) => ({
								...stage,
								position,
							})),
						},
					},
					select: { id: true, name: true, funnelType: true },
				});
				await this.createVersion(tx, pipeline.id, 1, pipeline.funnelType);
				return {
					id: pipeline.id,
					name: pipeline.name,
					funnelType: fromDbFunnelType(pipeline.funnelType),
				};
			});
		} catch (error) {
			throw defaultConflict(error);
		}
	}

	async publishBlueprint(
		input: { id: string; blueprint: PipelineBlueprint },
		scope: Prisma.PipelineWhereInput = {},
	) {
		const validation = validatePipelineBlueprint(input.blueprint);
		if (!validation.valid) {
			throw new BadRequestException(
				validation.errors
					.map((issue) => `${issue.path}: ${issue.message}`)
					.join(" "),
			);
		}
		await this.requirePipeline(input.id, scope);
		return this.db.$transaction(async (tx) => {
			await lockPipelines(tx, [input.id]);
			const pipeline = await tx.pipeline.findUnique({
				where: { id: input.id },
				select: {
					id: true,
					blueprintVersion: true,
					stages: {
						select: {
							...STAGE_POLICY_SELECT,
							_count: { select: { deals: true } },
						},
					},
				},
			});
			if (!pipeline)
				throw new NotFoundException(`No pipeline with id ${input.id}.`);
			const mapped = stageFromBlueprint(input.blueprint, pipeline.stages);
			if (mapped.size !== pipeline.stages.length) {
				throw new BadRequestException(
					"The blueprint must include every existing stage exactly once.",
				);
			}
			const stageByKey = new Map(
				pipeline.stages.map((stage) => [stage.key, stage]),
			);
			for (const stage of input.blueprint.stages) {
				for (const next of stage.allowedNextStages ?? []) {
					if (
						!stageByKey.has(next) &&
						!pipeline.stages.some((item) => item.id === next)
					) {
						throw new BadRequestException(`Unknown target stage ${next}.`);
					}
				}
			}
			for (const current of pipeline.stages) {
				const next = input.blueprint.stages.find(
					(stage) => stage.key === current.key || stage.key === current.id,
				);
				if (next?.type !== current.type && current._count.deals > 0) {
					throw new BadRequestException(
						"Move deals out of a stage before changing its outcome type.",
					);
				}
			}
			for (const [index, item] of [...mapped.values()].entries()) {
				await tx.pipelineStage.update({
					where: { id: item.stageId },
					data: { position: -(index + 1) },
				});
			}
			for (const item of mapped.values()) {
				await tx.pipelineStage.update({
					where: { id: item.stageId },
					data: item.data,
				});
			}
			const version = pipeline.blueprintVersion + 1;
			const created = await this.createVersion(
				tx,
				pipeline.id,
				version,
				toDbFunnelType(input.blueprint.type),
				input.blueprint.handovers,
			);
			await tx.pipeline.update({
				where: { id: pipeline.id },
				data: {
					funnelType: toDbFunnelType(input.blueprint.type),
					blueprintVersion: version,
				},
			});
			return {
				pipelineId: pipeline.id,
				version: created.version,
				type:
					input.blueprint.type === "side_bowtie"
						? "left_side"
						: input.blueprint.type,
			};
		});
	}

	async update(
		input: { id: string; name?: string; isDefault?: boolean },
		scope: Prisma.PipelineWhereInput = {},
	) {
		const current = await this.db.pipeline.findFirst({
			where: { AND: [{ id: input.id }, scope] },
			select: {
				id: true,
				isDefault: true,
				archivedAt: true,
				businessUnitId: true,
			},
		});
		if (!current)
			throw new NotFoundException(`No pipeline with id ${input.id}.`);
		if (input.isDefault === false && current.isDefault) {
			throw new BadRequestException(
				"Choose another default pipeline before removing this default.",
			);
		}
		if (input.isDefault && current.archivedAt) {
			throw new BadRequestException(
				"An archived pipeline cannot be the default.",
			);
		}
		if (input.isDefault) {
			try {
				return await this.db.$transaction(async (tx) => {
					await lockDefaultPipeline(tx);
					await lockPipelines(tx, [input.id]);
					const locked = await tx.pipeline.findUnique({
						where: { id: input.id },
						select: { archivedAt: true },
					});
					if (!locked)
						throw new NotFoundException(`No pipeline with id ${input.id}.`);
					if (locked.archivedAt) {
						throw new BadRequestException(
							"An archived pipeline cannot be the default.",
						);
					}
					await tx.pipeline.updateMany({
						where: { isDefault: true, businessUnitId: current.businessUnitId },
						data: { isDefault: false },
					});
					return tx.pipeline.update({
						where: { id: input.id },
						data: {
							isDefault: true,
							...(input.name ? { name: input.name.trim() } : {}),
						},
						select: { id: true, name: true, isDefault: true },
					});
				});
			} catch (error) {
				throw defaultConflict(error);
			}
		}
		return this.db.pipeline.update({
			where: { id: input.id },
			data: input.name ? { name: input.name.trim() } : {},
			select: { id: true, name: true, isDefault: true },
		});
	}

	async archive(id: string, scope: Prisma.PipelineWhereInput = {}) {
		await this.requirePipeline(id, scope);
		return this.db.$transaction(async (tx) => {
			await lockDefaultPipeline(tx);
			await lockPipelines(tx, [id]);
			const pipeline = await tx.pipeline.findUnique({
				where: { id },
				select: {
					isDefault: true,
					_count: { select: { deals: { where: { archivedAt: null } } } },
				},
			});
			if (!pipeline) throw new NotFoundException(`No pipeline with id ${id}.`);
			if (pipeline.isDefault) {
				throw new BadRequestException(
					"Choose another default pipeline before archiving this one.",
				);
			}
			if (pipeline._count.deals > 0) {
				throw new BadRequestException(
					"Move or archive this pipeline's active deals before archiving it.",
				);
			}
			return tx.pipeline.update({
				where: { id },
				data: { archivedAt: new Date() },
				select: { id: true },
			});
		});
	}

	async restore(id: string, scope: Prisma.PipelineWhereInput = {}) {
		await this.requirePipeline(id, scope);
		return this.db.$transaction(async (tx) => {
			await lockPipelines(tx, [id]);
			const pipeline = await tx.pipeline.findUnique({
				where: { id },
				select: {
					stages: {
						where: { type: PipelineStageType.OPEN },
						take: 1,
						select: { id: true },
					},
				},
			});
			if (!pipeline) throw new NotFoundException(`No pipeline with id ${id}.`);
			if (pipeline.stages.length === 0) {
				throw new BadRequestException(
					"Add an open stage before restoring this pipeline.",
				);
			}
			return tx.pipeline.update({
				where: { id },
				data: { archivedAt: null },
				select: { id: true },
			});
		});
	}

	async createStage(input: StageInput, scope: Prisma.PipelineWhereInput = {}) {
		await this.requirePipeline(input.pipelineId, scope);
		try {
			return await this.db.$transaction(async (tx) => {
				await lockPipelines(tx, [input.pipelineId]);
				const pipeline = await tx.pipeline.findUnique({
					where: { id: input.pipelineId },
					select: { id: true, blueprintVersion: true, funnelType: true },
				});
				if (!pipeline)
					throw new NotFoundException(
						`No pipeline with id ${input.pipelineId}.`,
					);
				const last = await tx.pipelineStage.findFirst({
					where: { pipelineId: input.pipelineId },
					orderBy: { position: "desc" },
					select: { position: true },
				});
				const existing = await tx.pipelineStage.findMany({
					where: { pipelineId: input.pipelineId },
					select: { id: true, key: true },
				});
				const key =
					input.key ??
					uniqueStageKey(
						input.name,
						existing.map((stage) => stage.key),
					);
				const allowedNextStageIds = this.resolveNextStageIds(
					input.allowedNextStages,
					existing,
				);
				const allowedRoles =
					input.allowedRoles ??
					(input.responsibleRole ? [input.responsibleRole] : []);
				assertStageRoles(
					allowedRoles,
					input.responsibleRole,
					input.defaultResponsibleRole,
				);
				const stage = await tx.pipelineStage.create({
					data: {
						pipelineId: input.pipelineId,
						key,
						name: input.name.trim(),
						type: input.type,
						position: (last?.position ?? -1) + 1,
						semanticPhase: input.semanticPhase ?? "conversion",
						allowedRoleKeys: allowedRoles,
						responsibleRoleKey: input.responsibleRole ?? null,
						defaultResponsibleRoleKey: input.defaultResponsibleRole ?? null,
						allowedNextStageIds,
					},
					select: STAGE_POLICY_SELECT,
				});
				await this.createVersion(
					tx,
					pipeline.id,
					pipeline.blueprintVersion + 1,
					pipeline.funnelType,
				);
				await tx.pipeline.update({
					where: { id: pipeline.id },
					data: { blueprintVersion: pipeline.blueprintVersion + 1 },
				});
				return stage;
			});
		} catch (error) {
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException
			)
				throw error;
			if (isUnique(error))
				throw new BadRequestException(
					"That stage key is already used in this pipeline.",
				);
			throw new BadRequestException("That pipeline no longer exists.");
		}
	}

	async updateStage(
		input: StageUpdateInput,
		scope: Prisma.PipelineWhereInput = {},
	) {
		await this.requireStage(input.id, scope);
		const located = await this.db.pipelineStage.findUnique({
			where: { id: input.id },
			select: { pipelineId: true },
		});
		if (!located) throw new NotFoundException(`No stage with id ${input.id}.`);
		try {
			return await this.db.$transaction(async (tx) => {
				await lockPipelines(tx, [located.pipelineId]);
				const current = await tx.pipelineStage.findUnique({
					where: { id: input.id },
					select: {
						...STAGE_POLICY_SELECT,
						pipelineId: true,
						pipeline: {
							select: {
								archivedAt: true,
								blueprintVersion: true,
								funnelType: true,
							},
						},
						_count: { select: { deals: true } },
					},
				});
				if (!current)
					throw new NotFoundException(`No stage with id ${input.id}.`);
				if (
					input.type !== undefined &&
					input.type !== current.type &&
					current._count.deals > 0
				) {
					throw new BadRequestException(
						"Move deals out of this stage before changing its outcome type.",
					);
				}
				if (
					current.pipeline.archivedAt === null &&
					current.type === PipelineStageType.OPEN &&
					input.type !== undefined &&
					input.type !== PipelineStageType.OPEN
				) {
					const otherOpenStages = await tx.pipelineStage.count({
						where: {
							pipelineId: current.pipelineId,
							type: PipelineStageType.OPEN,
							id: { not: input.id },
						},
					});
					if (otherOpenStages === 0)
						throw new BadRequestException(
							"An active pipeline needs at least one open stage.",
						);
				}
				const existing = await tx.pipelineStage.findMany({
					where: { pipelineId: current.pipelineId },
					select: { id: true, key: true },
				});
				const allowedRoles =
					input.allowedRoles ?? readStoredRoles(current.allowedRoleKeys);
				assertStageRoles(
					allowedRoles,
					input.responsibleRole === undefined
						? current.responsibleRoleKey
						: input.responsibleRole,
					input.defaultResponsibleRole === undefined
						? current.defaultResponsibleRoleKey
						: input.defaultResponsibleRole,
				);
				const data: Prisma.PipelineStageUpdateInput = {
					...(input.name !== undefined ? { name: input.name.trim() } : {}),
					...(input.key !== undefined ? { key: input.key } : {}),
					...(input.type !== undefined ? { type: input.type } : {}),
					...(input.semanticPhase !== undefined
						? { semanticPhase: input.semanticPhase }
						: {}),
					...(input.allowedRoles !== undefined
						? { allowedRoleKeys: input.allowedRoles }
						: {}),
					...(input.responsibleRole !== undefined
						? { responsibleRoleKey: input.responsibleRole }
						: {}),
					...(input.defaultResponsibleRole !== undefined
						? { defaultResponsibleRoleKey: input.defaultResponsibleRole }
						: {}),
					...(input.allowedNextStages !== undefined
						? {
								allowedNextStageIds: this.resolveNextStageIds(
									input.allowedNextStages,
									existing,
								),
							}
						: {}),
				};
				const stage = await tx.pipelineStage.update({
					where: { id: input.id },
					data,
					select: STAGE_POLICY_SELECT,
				});
				await this.createVersion(
					tx,
					current.pipelineId,
					current.pipeline.blueprintVersion + 1,
					current.pipeline.funnelType,
				);
				await tx.pipeline.update({
					where: { id: current.pipelineId },
					data: { blueprintVersion: current.pipeline.blueprintVersion + 1 },
				});
				return stage;
			});
		} catch (error) {
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException
			)
				throw error;
			if (isUnique(error))
				throw new BadRequestException(
					"That stage key is already used in this pipeline.",
				);
			throw error;
		}
	}

	async reorderStages(
		pipelineId: string,
		stageIds: string[],
		scope: Prisma.PipelineWhereInput = {},
	) {
		await this.requirePipeline(pipelineId, scope);
		await this.db.$transaction(async (tx) => {
			await lockPipelines(tx, [pipelineId]);
			const current = await tx.pipeline.findUnique({
				where: { id: pipelineId },
				select: {
					blueprintVersion: true,
					funnelType: true,
					stages: { select: { id: true } },
				},
			});
			if (!current)
				throw new NotFoundException(`No pipeline with id ${pipelineId}.`);
			const expected = new Set(current.stages.map((stage) => stage.id));
			if (
				stageIds.length !== expected.size ||
				new Set(stageIds).size !== stageIds.length ||
				stageIds.some((id) => !expected.has(id))
			) {
				throw new BadRequestException(
					"Reordering must include every stage in this pipeline exactly once.",
				);
			}
			for (const [index, id] of stageIds.entries())
				await tx.pipelineStage.update({
					where: { id },
					data: { position: -(index + 1) },
				});
			for (const [position, id] of stageIds.entries())
				await tx.pipelineStage.update({ where: { id }, data: { position } });
			await this.createVersion(
				tx,
				pipelineId,
				current.blueprintVersion + 1,
				current.funnelType,
			);
			await tx.pipeline.update({
				where: { id: pipelineId },
				data: { blueprintVersion: current.blueprintVersion + 1 },
			});
		});
		return { pipelineId, stageIds };
	}

	async removeStage(id: string, scope: Prisma.PipelineWhereInput = {}) {
		await this.requireStage(id, scope);
		const located = await this.db.pipelineStage.findUnique({
			where: { id },
			select: { pipelineId: true },
		});
		if (!located) throw new NotFoundException(`No stage with id ${id}.`);
		await this.db.$transaction(async (tx) => {
			await lockPipelines(tx, [located.pipelineId]);
			const stage = await tx.pipelineStage.findUnique({
				where: { id },
				select: {
					pipelineId: true,
					position: true,
					type: true,
					pipeline: {
						select: {
							archivedAt: true,
							blueprintVersion: true,
							funnelType: true,
						},
					},
					_count: { select: { deals: true } },
				},
			});
			if (!stage) throw new NotFoundException(`No stage with id ${id}.`);
			if (stage._count.deals > 0)
				throw new BadRequestException(
					"Move deals out of this stage before removing it.",
				);
			const count = await tx.pipelineStage.count({
				where: { pipelineId: stage.pipelineId },
			});
			if (count === 1)
				throw new BadRequestException("A pipeline needs at least one stage.");
			if (
				stage.pipeline.archivedAt === null &&
				stage.type === PipelineStageType.OPEN
			) {
				const openStages = await tx.pipelineStage.count({
					where: { pipelineId: stage.pipelineId, type: PipelineStageType.OPEN },
				});
				if (openStages === 1)
					throw new BadRequestException(
						"An active pipeline needs at least one open stage.",
					);
			}
			await tx.pipelineStage.delete({ where: { id } });
			const following = await tx.pipelineStage.findMany({
				where: {
					pipelineId: stage.pipelineId,
					position: { gt: stage.position },
				},
				orderBy: { position: "asc" },
				select: { id: true },
			});
			for (const [offset, next] of following.entries())
				await tx.pipelineStage.update({
					where: { id: next.id },
					data: { position: stage.position + offset },
				});
			await this.createVersion(
				tx,
				stage.pipelineId,
				stage.pipeline.blueprintVersion + 1,
				stage.pipeline.funnelType,
			);
			await tx.pipeline.update({
				where: { id: stage.pipelineId },
				data: { blueprintVersion: stage.pipeline.blueprintVersion + 1 },
			});
		});
		return { id };
	}

	private async createVersion(
		tx: Prisma.TransactionClient,
		pipelineId: string,
		version: number,
		funnelType: DbPipelineFunnelType,
		handoverInput: PipelineBlueprint["handovers"] = [],
	) {
		const stages = (await tx.pipelineStage.findMany({
			where: { pipelineId },
			orderBy: { position: "asc" },
			select: STAGE_POLICY_SELECT,
		})) as StagePolicyRow[];
		const stageIds = new Set(stages.map((stage) => stage.id));
		const existingVersion = await tx.pipelineBlueprintVersion.findUnique({
			where: {
				pipelineId_version: { pipelineId, version: Math.max(1, version - 1) },
			},
			select: { handoverRules: { select: RULE_SELECT } },
		});
		const byKey = new Map(stages.map((stage) => [stage.key, stage.id]));
		const rules: HandoverRuleRow[] =
			handoverInput.length > 0
				? handoverInput
						.map((rule) => ({
							fromStageId: byKey.get(rule.fromStage) ?? rule.fromStage,
							toStageId: byKey.get(rule.toStage) ?? rule.toStage,
							fromRoleKey: rule.fromRole,
							toRoleKey: rule.toRole,
							acceptanceRequired: rule.acceptanceRequired ?? false,
							acceptanceSlaMinutes: rule.acceptanceSlaMinutes ?? null,
							assignmentStrategy: rule.assignmentStrategy ?? "manual",
						}))
						.filter(
							(rule) =>
								stageIds.has(rule.fromStageId) && stageIds.has(rule.toStageId),
						)
				: (existingVersion?.handoverRules ?? []).filter(
						(rule) =>
							stageIds.has(rule.fromStageId) && stageIds.has(rule.toStageId),
					);
		const snapshot = snapshotFor(fromDbFunnelType(funnelType), stages, rules);
		return tx.pipelineBlueprintVersion.create({
			data: {
				pipelineId,
				version,
				funnelType,
				snapshot: snapshot as unknown as Prisma.InputJsonObject,
				handoverRules: {
					create: rules.map((rule) => ({
						fromStageId: rule.fromStageId,
						toStageId: rule.toStageId,
						fromRoleKey: rule.fromRoleKey,
						toRoleKey: rule.toRoleKey,
						acceptanceRequired: rule.acceptanceRequired,
						acceptanceSlaMinutes: rule.acceptanceSlaMinutes,
						assignmentStrategy: rule.assignmentStrategy,
					})),
				},
			},
			select: { version: true },
		});
	}

	private resolveNextStageIds(
		keys: string[] | undefined,
		stages: Array<{ id: string; key: string }>,
	) {
		if (!keys) return [];
		const byKey = new Map(stages.map((stage) => [stage.key, stage.id]));
		return keys.map((key) => byKey.get(key) ?? key);
	}

	private async requirePipeline(id: string, scope: Prisma.PipelineWhereInput) {
		const pipeline = await this.db.pipeline.findFirst({
			where: { AND: [{ id }, scope] },
			select: { id: true },
		});
		if (!pipeline) throw new NotFoundException(`No pipeline with id ${id}.`);
	}

	private async requireStage(id: string, scope: Prisma.PipelineWhereInput) {
		const stage = await this.db.pipelineStage.findFirst({
			where: { id, pipeline: scope },
			select: { id: true },
		});
		if (!stage) throw new NotFoundException(`No stage with id ${id}.`);
	}
}

function uniqueStageKey(name: string, existing: string[]) {
	const base = slugify(name);
	if (!existing.includes(base)) return base;
	let suffix = 2;
	while (existing.includes(`${base}-${suffix}`)) suffix += 1;
	return `${base}-${suffix}`;
}

function slugify(value: string) {
	return (
		value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "stage"
	);
}

function readStoredRoles(value: Prisma.JsonValue) {
	return readStringArray(value);
}

function assertStageRoles(
	allowedRoles: string[],
	responsibleRole: string | null | undefined,
	defaultResponsibleRole: string | null | undefined,
) {
	if (responsibleRole && !allowedRoles.includes(responsibleRole)) {
		throw new BadRequestException(
			"The responsible role must be allowed on the stage.",
		);
	}
	if (
		defaultResponsibleRole &&
		!allowedRoles.includes(defaultResponsibleRole)
	) {
		throw new BadRequestException(
			"The default responsible role must be allowed on the stage.",
		);
	}
}

function isUnique(error: unknown) {
	return (
		error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}

function defaultConflict(error: unknown): Error {
	if (isUnique(error)) {
		return new BadRequestException(
			"Another pipeline became the default. Refresh and try again.",
		);
	}
	return error instanceof Error ? error : new Error(String(error));
}
