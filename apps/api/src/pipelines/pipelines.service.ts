import {
	type Db,
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
import { lockDefaultPipeline, lockPipelines } from "./pipeline-locks";

const STARTING_STAGES = [
	{ name: "Demo booked", type: PipelineStageType.OPEN },
	{ name: "Qualified to buy", type: PipelineStageType.OPEN },
	{ name: "Decision maker in", type: PipelineStageType.OPEN },
	{ name: "Contract sent", type: PipelineStageType.OPEN },
	{ name: "Closed won", type: PipelineStageType.WON },
	{ name: "Closed lost", type: PipelineStageType.LOST },
	{ name: "Unqualified", type: PipelineStageType.UNQUALIFIED },
] as const;

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
				businessUnit: { select: { id: true, name: true } },
				stages: {
					orderBy: { position: "asc" },
					select: {
						id: true,
						name: true,
						position: true,
						type: true,
						_count: { select: { deals: true } },
					},
				},
				_count: { select: { deals: true } },
			},
		});
	}

	async create(name: string, businessUnitId: string | null = null) {
		try {
			return await this.db.$transaction(async (tx) => {
				await lockDefaultPipeline(tx);
				const active = await tx.pipeline.count({
					where: { archivedAt: null, businessUnitId },
				});
				return tx.pipeline.create({
					data: {
						name: name.trim(),
						isDefault: active === 0,
						businessUnitId,
						stages: {
							create: STARTING_STAGES.map((stage, position) => ({
								...stage,
								position,
							})),
						},
					},
					select: { id: true, name: true },
				});
			});
		} catch (error) {
			throw defaultConflict(error);
		}
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
						where: {
							isDefault: true,
							businessUnitId: current.businessUnitId,
						},
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

	async createStage(
		input: {
			pipelineId: string;
			name: string;
			type: PipelineStageType;
		},
		scope: Prisma.PipelineWhereInput = {},
	) {
		await this.requirePipeline(input.pipelineId, scope);
		try {
			return await this.db.$transaction(async (tx) => {
				await lockPipelines(tx, [input.pipelineId]);
				const pipeline = await tx.pipeline.findUnique({
					where: { id: input.pipelineId },
					select: { id: true },
				});
				if (!pipeline) {
					throw new NotFoundException(
						`No pipeline with id ${input.pipelineId}.`,
					);
				}
				const last = await tx.pipelineStage.findFirst({
					where: { pipelineId: input.pipelineId },
					orderBy: { position: "desc" },
					select: { position: true },
				});
				return tx.pipelineStage.create({
					data: {
						pipelineId: input.pipelineId,
						name: input.name.trim(),
						type: input.type,
						position: (last?.position ?? -1) + 1,
					},
					select: { id: true, name: true, position: true, type: true },
				});
			});
		} catch (error) {
			if (error instanceof NotFoundException) throw error;
			throw new BadRequestException("That pipeline no longer exists.");
		}
	}

	async updateStage(
		input: {
			id: string;
			name?: string;
			type?: PipelineStageType;
		},
		scope: Prisma.PipelineWhereInput = {},
	) {
		await this.requireStage(input.id, scope);
		const located = await this.db.pipelineStage.findUnique({
			where: { id: input.id },
			select: { pipelineId: true },
		});
		if (!located) throw new NotFoundException(`No stage with id ${input.id}.`);

		return this.db.$transaction(async (tx) => {
			await lockPipelines(tx, [located.pipelineId]);
			const current = await tx.pipelineStage.findUnique({
				where: { id: input.id },
				select: {
					pipelineId: true,
					type: true,
					pipeline: { select: { archivedAt: true } },
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
				if (otherOpenStages === 0) {
					throw new BadRequestException(
						"An active pipeline needs at least one open stage.",
					);
				}
			}
			return tx.pipelineStage.update({
				where: { id: input.id },
				data: {
					...(input.name ? { name: input.name.trim() } : {}),
					...(input.type ? { type: input.type } : {}),
				},
				select: { id: true, name: true, position: true, type: true },
			});
		});
	}

	async reorderStages(
		pipelineId: string,
		stageIds: string[],
		scope: Prisma.PipelineWhereInput = {},
	) {
		await this.requirePipeline(pipelineId, scope);
		await this.db.$transaction(async (tx) => {
			await lockPipelines(tx, [pipelineId]);
			const current = await tx.pipelineStage.findMany({
				where: { pipelineId },
				select: { id: true },
			});
			const expected = new Set(current.map((stage) => stage.id));
			if (
				stageIds.length !== expected.size ||
				new Set(stageIds).size !== stageIds.length ||
				stageIds.some((id) => !expected.has(id))
			) {
				throw new BadRequestException(
					"Reordering must include every stage in this pipeline exactly once.",
				);
			}
			for (const [index, id] of stageIds.entries()) {
				await tx.pipelineStage.update({
					where: { id },
					data: { position: -(index + 1) },
				});
			}
			for (const [position, id] of stageIds.entries()) {
				await tx.pipelineStage.update({ where: { id }, data: { position } });
			}
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
					pipeline: { select: { archivedAt: true } },
					_count: { select: { deals: true } },
				},
			});
			if (!stage) throw new NotFoundException(`No stage with id ${id}.`);
			if (stage._count.deals > 0) {
				throw new BadRequestException(
					"Move deals out of this stage before removing it.",
				);
			}
			const count = await tx.pipelineStage.count({
				where: { pipelineId: stage.pipelineId },
			});
			if (count === 1) {
				throw new BadRequestException("A pipeline needs at least one stage.");
			}
			if (
				stage.pipeline.archivedAt === null &&
				stage.type === PipelineStageType.OPEN
			) {
				const openStages = await tx.pipelineStage.count({
					where: {
						pipelineId: stage.pipelineId,
						type: PipelineStageType.OPEN,
					},
				});
				if (openStages === 1) {
					throw new BadRequestException(
						"An active pipeline needs at least one open stage.",
					);
				}
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
			for (const [offset, next] of following.entries()) {
				await tx.pipelineStage.update({
					where: { id: next.id },
					data: { position: stage.position + offset },
				});
			}
		});
		return { id };
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

function defaultConflict(error: unknown): Error {
	if (
		error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
		error.code === "P2002"
	) {
		return new BadRequestException(
			"Another pipeline became the default. Refresh and try again.",
		);
	}
	return error instanceof Error ? error : new Error(String(error));
}
