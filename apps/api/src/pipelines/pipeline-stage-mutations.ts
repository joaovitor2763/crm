import { type Db, PipelineStageType, type Prisma } from "@crm/db";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { lockPipelines } from "./pipeline-locks";
import {
	createBlueprintVersion,
	STAGE_POLICY_SELECT,
} from "./pipeline-persistence";
import {
	assertStageRoles,
	isUnique,
	readStoredRoles,
	requirePipeline,
	requireStage,
	resolveNextStageIds,
	StageInput,
	StageUpdateInput,
	uniqueStageKey,
} from "./pipeline-stage-helpers";

export async function createPipelineStage(
	db: Db,
	input: StageInput,
	scope: Prisma.PipelineWhereInput = {},
) {
	await requirePipeline(db, input.pipelineId, scope);
	try {
		return await db.$transaction(async (tx) => {
			await lockPipelines(tx, [input.pipelineId]);
			const pipeline = await tx.pipeline.findUnique({
				where: { id: input.pipelineId },
				select: { id: true, blueprintVersion: true, funnelType: true },
			});
			if (!pipeline)
				throw new NotFoundException(`No pipeline with id ${input.pipelineId}.`);
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
			const allowedNextStageIds = resolveNextStageIds(
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
			await createBlueprintVersion(
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

export async function updatePipelineStage(
	db: Db,
	input: StageUpdateInput,
	scope: Prisma.PipelineWhereInput = {},
) {
	await requireStage(db, input.id, scope);
	const located = await db.pipelineStage.findUnique({
		where: { id: input.id },
		select: { pipelineId: true },
	});
	if (!located) throw new NotFoundException(`No stage with id ${input.id}.`);
	try {
		return await db.$transaction(async (tx) => {
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
							allowedNextStageIds: resolveNextStageIds(
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
			await createBlueprintVersion(
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
