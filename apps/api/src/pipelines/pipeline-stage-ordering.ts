import { type Db, PipelineStageType, type Prisma } from "@crm/db";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { lockPipelines } from "./pipeline-locks";
import { createBlueprintVersion } from "./pipeline-persistence";
import { requirePipeline, requireStage } from "./pipeline-stage-helpers";

export async function reorderPipelineStages(
	db: Db,
	pipelineId: string,
	stageIds: string[],
	scope: Prisma.PipelineWhereInput = {},
) {
	await requirePipeline(db, pipelineId, scope);
	await db.$transaction(async (tx) => {
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
		await createBlueprintVersion(
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

export async function removePipelineStage(
	db: Db,
	id: string,
	scope: Prisma.PipelineWhereInput = {},
) {
	await requireStage(db, id, scope);
	const located = await db.pipelineStage.findUnique({
		where: { id },
		select: { pipelineId: true },
	});
	if (!located) throw new NotFoundException(`No stage with id ${id}.`);
	await db.$transaction(async (tx) => {
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
		await createBlueprintVersion(
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
