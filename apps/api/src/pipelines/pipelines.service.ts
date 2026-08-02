import { type Db, PipelineStageType, type Prisma } from "@crm/db";
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
	createBlueprintVersion,
	fromDbFunnelType,
	publicBlueprint,
	STAGE_POLICY_SELECT,
	stageFromBlueprint,
	toDbFunnelType,
} from "./pipeline-persistence";
import {
	defaultConflict,
	requirePipeline,
	type StageInput,
	type StageUpdateInput,
} from "./pipeline-stage-helpers";
import {
	createPipelineStage,
	updatePipelineStage,
} from "./pipeline-stage-mutations";
import {
	removePipelineStage,
	reorderPipelineStages,
} from "./pipeline-stage-ordering";

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
				await createBlueprintVersion(tx, pipeline.id, 1, pipeline.funnelType);
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
		await requirePipeline(this.db, input.id, scope);
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
			const created = await createBlueprintVersion(
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
		await requirePipeline(this.db, id, scope);
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
		await requirePipeline(this.db, id, scope);
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
		return createPipelineStage(this.db, input, scope);
	}

	async updateStage(
		input: StageUpdateInput,
		scope: Prisma.PipelineWhereInput = {},
	) {
		return updatePipelineStage(this.db, input, scope);
	}

	async reorderStages(
		pipelineId: string,
		stageIds: string[],
		scope: Prisma.PipelineWhereInput = {},
	) {
		return reorderPipelineStages(this.db, pipelineId, stageIds, scope);
	}

	async removeStage(id: string, scope: Prisma.PipelineWhereInput = {}) {
		return removePipelineStage(this.db, id, scope);
	}
}
