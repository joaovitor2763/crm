import {
	PipelineFunnelType as DbPipelineFunnelType,
	PipelineStageType,
	type Prisma,
} from "@crm/db";
import type {
	PipelineBlueprint,
	PipelineFunnelType,
	PipelineHandover,
} from "./pipeline-blueprint";

export type StagePolicyRow = {
	id: string;
	key: string;
	name: string;
	position: number;
	type: PipelineStageType;
	semanticPhase: string;
	allowedRoleKeys: Prisma.JsonValue;
	responsibleRoleKey: string | null;
	defaultResponsibleRoleKey: string | null;
	allowedNextStageIds: Prisma.JsonValue;
};

export type HandoverRuleRow = {
	fromStageId: string;
	toStageId: string;
	fromRoleKey: string;
	toRoleKey: string;
	acceptanceRequired: boolean;
	acceptanceSlaMinutes: number | null;
	assignmentStrategy: string;
};

export const STAGE_POLICY_SELECT = {
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

export type PersistedBlueprintSnapshot = {
	type: PipelineFunnelType;
	stages: Array<{
		id: string;
		key: string;
		position: number;
		type: PipelineStageType;
		semanticPhase: string;
		allowedRoles: string[];
		responsibleRole: string | null;
		defaultResponsibleRole: string | null;
		allowedNextStages: string[];
	}>;
	handovers: PipelineHandover[];
};

const DB_TO_API_FUNNEL: Record<DbPipelineFunnelType, PipelineFunnelType> = {
	FULL_BOWTIE: "full_bowtie",
	LEFT_SIDE: "left_side",
	RIGHT_SIDE: "right_side",
	CUSTOM: "custom",
};

const API_TO_DB_FUNNEL: Record<
	Exclude<PipelineFunnelType, "side_bowtie">,
	DbPipelineFunnelType
> = {
	full_bowtie: DbPipelineFunnelType.FULL_BOWTIE,
	left_side: DbPipelineFunnelType.LEFT_SIDE,
	right_side: DbPipelineFunnelType.RIGHT_SIDE,
	custom: DbPipelineFunnelType.CUSTOM,
};

export function toDbFunnelType(type: PipelineFunnelType): DbPipelineFunnelType {
	return API_TO_DB_FUNNEL[type === "side_bowtie" ? "left_side" : type];
}

export function fromDbFunnelType(
	type: DbPipelineFunnelType,
): PipelineFunnelType {
	return DB_TO_API_FUNNEL[type];
}

export function readStringArray(value: Prisma.JsonValue): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

export function publicBlueprint(
	type: DbPipelineFunnelType,
	stages: StagePolicyRow[],
	rules: HandoverRuleRow[],
): PipelineBlueprint | null {
	if (
		!stages.some((stage) => readStringArray(stage.allowedRoleKeys).length > 0)
	) {
		return null;
	}
	const byId = new Map(stages.map((stage) => [stage.id, stage.key]));
	return {
		type: fromDbFunnelType(type),
		stages: stages.map((stage) => ({
			key: stage.key,
			position: stage.position,
			type: stage.type,
			semanticPhase: stage.semanticPhase,
			allowedRoles: readStringArray(stage.allowedRoleKeys),
			responsibleRole: stage.responsibleRoleKey ?? "",
			...(stage.defaultResponsibleRoleKey
				? { defaultResponsibleRole: stage.defaultResponsibleRoleKey }
				: {}),
			allowedNextStages: readStringArray(stage.allowedNextStageIds)
				.map((id) => byId.get(id))
				.filter((key): key is string => Boolean(key)),
		})),
		handovers: rules.map((rule) => ({
			fromStage: byId.get(rule.fromStageId) ?? rule.fromStageId,
			toStage: byId.get(rule.toStageId) ?? rule.toStageId,
			fromRole: rule.fromRoleKey,
			toRole: rule.toRoleKey,
			acceptanceRequired: rule.acceptanceRequired,
			...(rule.acceptanceSlaMinutes !== null
				? { acceptanceSlaMinutes: rule.acceptanceSlaMinutes }
				: {}),
			assignmentStrategy:
				rule.assignmentStrategy as PipelineHandover["assignmentStrategy"],
		})),
	};
}

export function snapshotFor(
	type: PipelineFunnelType,
	stages: StagePolicyRow[],
	rules: HandoverRuleRow[],
): PersistedBlueprintSnapshot {
	const byId = new Map(stages.map((stage) => [stage.id, stage.key]));
	return {
		type,
		stages: stages.map((stage) => ({
			id: stage.id,
			key: stage.key,
			position: stage.position,
			type: stage.type,
			semanticPhase: stage.semanticPhase,
			allowedRoles: readStringArray(stage.allowedRoleKeys),
			responsibleRole: stage.responsibleRoleKey,
			defaultResponsibleRole: stage.defaultResponsibleRoleKey,
			allowedNextStages: readStringArray(stage.allowedNextStageIds).map(
				(id) => byId.get(id) ?? id,
			),
		})),
		handovers: rules.map((rule) => ({
			fromStage: byId.get(rule.fromStageId) ?? rule.fromStageId,
			toStage: byId.get(rule.toStageId) ?? rule.toStageId,
			fromRole: rule.fromRoleKey,
			toRole: rule.toRoleKey,
			acceptanceRequired: rule.acceptanceRequired,
			...(rule.acceptanceSlaMinutes !== null
				? { acceptanceSlaMinutes: rule.acceptanceSlaMinutes }
				: {}),
			assignmentStrategy:
				rule.assignmentStrategy as PipelineHandover["assignmentStrategy"],
		})),
	};
}

export function stageFromBlueprint(
	blueprint: PipelineBlueprint,
	stages: StagePolicyRow[],
): Map<string, { stageId: string; data: Prisma.PipelineStageUpdateInput }> {
	const byKey = new Map(stages.map((stage) => [stage.key, stage]));
	const byId = new Map(stages.map((stage) => [stage.id, stage]));
	const result = new Map<
		string,
		{ stageId: string; data: Prisma.PipelineStageUpdateInput }
	>();
	for (const stage of blueprint.stages) {
		const current = byKey.get(stage.key) ?? byId.get(stage.key);
		if (!current) continue;
		const allowedNextStageIds = (stage.allowedNextStages ?? []).map(
			(nextKey) => byKey.get(nextKey)?.id ?? byId.get(nextKey)?.id ?? nextKey,
		);
		result.set(stage.key, {
			stageId: current.id,
			data: {
				key: stage.key,
				name: current.name,
				position: stage.position,
				type: stage.type,
				semanticPhase: stage.semanticPhase ?? "conversion",
				allowedRoleKeys: stage.allowedRoles,
				responsibleRoleKey: stage.responsibleRole,
				defaultResponsibleRoleKey: stage.defaultResponsibleRole ?? null,
				allowedNextStageIds,
			},
		});
	}
	return result;
}

export function stagePolicyEnabled(stage: {
	allowedRoleKeys: Prisma.JsonValue;
	responsibleRoleKey: string | null;
	defaultResponsibleRoleKey: string | null;
	allowedNextStageIds: Prisma.JsonValue;
}): boolean {
	return (
		readStringArray(stage.allowedRoleKeys).length > 0 ||
		stage.responsibleRoleKey !== null ||
		stage.defaultResponsibleRoleKey !== null ||
		readStringArray(stage.allowedNextStageIds).length > 0
	);
}

const HANDOVER_RULE_SELECT = {
	fromStageId: true,
	toStageId: true,
	fromRoleKey: true,
	toRoleKey: true,
	acceptanceRequired: true,
	acceptanceSlaMinutes: true,
	assignmentStrategy: true,
} as const;

export async function createBlueprintVersion(
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
		select: { handoverRules: { select: HANDOVER_RULE_SELECT } },
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
