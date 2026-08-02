import { PipelineStageType } from "@crm/db";

export const PIPELINE_FUNNEL_TYPES = [
	"full_bowtie",
	"left_side",
	"right_side",
	"custom",
	/** @deprecated Use left_side or right_side for new blueprints. */
	"side_bowtie",
] as const;
export type PipelineFunnelType = (typeof PIPELINE_FUNNEL_TYPES)[number];

export const PIPELINE_ASSIGNMENT_STRATEGIES = [
	"manual",
	"role_default",
	"round_robin",
	"owner",
] as const;
export type PipelineAssignmentStrategy =
	(typeof PIPELINE_ASSIGNMENT_STRATEGIES)[number];

export const PIPELINE_ROLES = ["sdr", "closer", "account_manager"] as const;
/** Standard roles are suggestions; companies may use their own role keys. */
export type PipelineRole = string;

export type PipelineBlueprintStage = {
	key: string;
	position: number;
	type: PipelineStageType;
	semanticPhase?: string;
	allowedRoles: readonly PipelineRole[];
	responsibleRole: PipelineRole;
	defaultResponsibleRole?: PipelineRole;
	allowedNextStages?: readonly string[];
};

export type PipelineHandover = {
	fromStage: string;
	toStage: string;
	fromRole: PipelineRole;
	toRole: PipelineRole;
	acceptanceRequired?: boolean;
	acceptanceSlaMinutes?: number;
	assignmentStrategy?: PipelineAssignmentStrategy;
};

export type PipelineBlueprint = {
	type: PipelineFunnelType;
	stages: readonly PipelineBlueprintStage[];
	handovers: readonly PipelineHandover[];
};

export type PipelineTransitionRequest = {
	fromStage: string;
	toStage: string;
	actingRole?: PipelineRole;
	handoverToRole?: PipelineRole;
	handoverAccepted?: boolean;
};

export type BlueprintIssue = {
	path: string;
	message: string;
};

export type BlueprintValidation = {
	valid: boolean;
	errors: BlueprintIssue[];
	warnings: BlueprintIssue[];
};

/**
 * Validates a proposed funnel before it is published as an immutable version.
 * The same rules are reused by the persistence service and the transition
 * guard in DealsService.
 */
export function validatePipelineBlueprint(
	blueprint: PipelineBlueprint,
): BlueprintValidation {
	const errors: BlueprintIssue[] = [];
	const warnings: BlueprintIssue[] = [];
	const stageKeys = new Set<string>();
	const positions = new Set<number>();
	const stageByKey = new Map<string, PipelineBlueprintStage>();

	if (blueprint.stages.length === 0) {
		errors.push({
			path: "stages",
			message: "A pipeline needs at least one stage.",
		});
	}

	for (const [index, stage] of blueprint.stages.entries()) {
		const path = `stages.${index}`;
		if (stageKeys.has(stage.key)) {
			errors.push({
				path: `${path}.key`,
				message: "Stage keys must be unique.",
			});
		}
		stageKeys.add(stage.key);
		stageByKey.set(stage.key, stage);
		if (positions.has(stage.position)) {
			errors.push({
				path: `${path}.position`,
				message: "Stage positions must be unique.",
			});
		}
		positions.add(stage.position);
		if (stage.allowedRoles.length === 0) {
			errors.push({
				path: `${path}.allowedRoles`,
				message: "Every stage needs at least one allowed role.",
			});
		}
		if (!stage.allowedRoles.includes(stage.responsibleRole)) {
			errors.push({
				path: `${path}.responsibleRole`,
				message: "The responsible role must be allowed on the stage.",
			});
		}
		if (
			stage.defaultResponsibleRole &&
			!stage.allowedRoles.includes(stage.defaultResponsibleRole)
		) {
			errors.push({
				path: `${path}.defaultResponsibleRole`,
				message: "The default responsible role must be allowed on the stage.",
			});
		}
	}
	for (const [index, stage] of blueprint.stages.entries()) {
		for (const nextStage of stage.allowedNextStages ?? []) {
			if (!stageKeys.has(nextStage)) {
				errors.push({
					path: `stages.${index}.allowedNextStages`,
					message: `The target stage ${nextStage} does not exist.`,
				});
			}
		}
	}

	const terminalTypes = new Set(
		blueprint.stages
			.filter((stage) => stage.type !== PipelineStageType.OPEN)
			.map((stage) => stage.type),
	);
	if (
		!blueprint.stages.some((stage) => stage.type === PipelineStageType.OPEN)
	) {
		errors.push({
			path: "stages",
			message: "A pipeline needs at least one open stage.",
		});
	}
	if (blueprint.type === "full_bowtie") {
		for (const type of [PipelineStageType.WON, PipelineStageType.LOST]) {
			if (!terminalTypes.has(type)) {
				errors.push({
					path: "type",
					message: `A full bowtie needs a ${type.toLowerCase()} branch.`,
				});
			}
		}
	} else if (
		blueprint.type === "left_side" ||
		blueprint.type === "right_side" ||
		blueprint.type === "side_bowtie"
	) {
		if (terminalTypes.size === 0) {
			errors.push({
				path: "type",
				message: "A side bowtie needs at least one outcome branch.",
			});
		}
	} else if (blueprint.type === "custom") {
		if (terminalTypes.size > 1) {
			warnings.push({
				path: "type",
				message: "Custom funnels may expose multiple outcome branches.",
			});
		}
	} else if (terminalTypes.size > 1) {
		warnings.push({
			path: "type",
			message:
				"A side bowtie is normally one-sided; additional outcome branches are retained but should be reviewed.",
		});
	}

	for (const [index, handover] of blueprint.handovers.entries()) {
		const path = `handovers.${index}`;
		const from = stageByKey.get(handover.fromStage);
		const to = stageByKey.get(handover.toStage);
		if (!from) {
			errors.push({
				path: `${path}.fromStage`,
				message: "Source stage does not exist.",
			});
		}
		if (!to) {
			errors.push({
				path: `${path}.toStage`,
				message: "Target stage does not exist.",
			});
		}
		if (from && !from.allowedRoles.includes(handover.fromRole)) {
			errors.push({
				path: `${path}.fromRole`,
				message: "The handover source role is not allowed on the source stage.",
			});
		}
		if (to && !to.allowedRoles.includes(handover.toRole)) {
			errors.push({
				path: `${path}.toRole`,
				message: "The handover target role is not allowed on the target stage.",
			});
		}
		if (from && from.responsibleRole !== handover.fromRole) {
			warnings.push({
				path: `${path}.fromRole`,
				message:
					"The handover source role differs from the stage responsible role.",
			});
		}
		if (
			handover.acceptanceSlaMinutes !== undefined &&
			(!Number.isInteger(handover.acceptanceSlaMinutes) ||
				handover.acceptanceSlaMinutes <= 0)
		) {
			errors.push({
				path: `${path}.acceptanceSlaMinutes`,
				message: "An acceptance SLA must be a positive number of minutes.",
			});
		}
	}

	return { valid: errors.length === 0, errors, warnings };
}

export type PipelineStageSnapshot = Pick<
	PipelineBlueprintStage,
	"position" | "type"
>;

/** Infers the currently stored topology without pretending it is a policy. */
export function inferPipelineFunnelType(
	stages: PipelineStageSnapshot[],
): PipelineFunnelType {
	const hasWon = stages.some((stage) => stage.type === PipelineStageType.WON);
	const hasLost = stages.some((stage) => stage.type === PipelineStageType.LOST);
	return hasWon && hasLost ? "full_bowtie" : "side_bowtie";
}

export function validateBlueprintTransition(
	blueprint: PipelineBlueprint,
	request: PipelineTransitionRequest,
): BlueprintValidation {
	const errors: BlueprintIssue[] = [];
	const from = blueprint.stages.find(
		(stage) => stage.key === request.fromStage,
	);
	const to = blueprint.stages.find((stage) => stage.key === request.toStage);
	if (!from) {
		errors.push({ path: "fromStage", message: "Source stage does not exist." });
	}
	if (!to) {
		errors.push({ path: "toStage", message: "Target stage does not exist." });
	}
	if (!from || !to) return { valid: false, errors, warnings: [] };
	if (request.actingRole && !from.allowedRoles.includes(request.actingRole)) {
		errors.push({
			path: "actingRole",
			message: "The acting role is not allowed on the source stage.",
		});
	}
	const handover = blueprint.handovers.find(
		(rule) => rule.fromStage === from.key && rule.toStage === to.key,
	);
	if (from.responsibleRole !== to.responsibleRole) {
		if (!handover) {
			errors.push({
				path: "handovers",
				message: "A role change needs an explicit handover rule.",
			});
		} else if (request.actingRole && request.actingRole !== handover.fromRole) {
			errors.push({
				path: "actingRole",
				message: "The acting role does not own this handover.",
			});
		}
	}
	if (request.handoverToRole && request.handoverToRole !== to.responsibleRole) {
		errors.push({
			path: "handoverToRole",
			message: "The handover target role must own the target stage.",
		});
	}
	if (
		handover &&
		request.handoverToRole &&
		request.handoverToRole !== handover.toRole
	) {
		errors.push({
			path: "handoverToRole",
			message: "The handover target role does not match the configured rule.",
		});
	}
	if (handover?.acceptanceRequired && request.handoverAccepted !== true) {
		errors.push({
			path: "handoverAccepted",
			message: "This handover must be explicitly accepted.",
		});
	}
	if (
		from.allowedNextStages &&
		from.key !== to.key &&
		!from.allowedNextStages.includes(to.key)
	) {
		errors.push({
			path: "toStage",
			message: "The target stage is not allowed from the source stage.",
		});
	}
	return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateStageTransition(
	from: PipelineStageSnapshot,
	to: PipelineStageSnapshot,
): BlueprintValidation {
	if (from.position === to.position && from.type === to.type) {
		return { valid: true, errors: [], warnings: [] };
	}
	// The stored CRM model permits reopening and moving between terminal stages;
	// losing/won reason requirements remain enforced by DealsService.
	return { valid: true, errors: [], warnings: [] };
}
