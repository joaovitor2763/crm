import { PipelineStageType } from "@crm/db";

export const PIPELINE_FUNNEL_TYPES = ["full_bowtie", "side_bowtie"] as const;
export type PipelineFunnelType = (typeof PIPELINE_FUNNEL_TYPES)[number];

export const PIPELINE_ROLES = ["sdr", "closer", "account_manager"] as const;
/** Standard roles are suggestions; companies may use their own role keys. */
export type PipelineRole = string;

export type PipelineBlueprintStage = {
	key: string;
	position: number;
	type: PipelineStageType;
	allowedRoles: readonly PipelineRole[];
	responsibleRole: PipelineRole;
	allowedNextStages?: readonly string[];
};

export type PipelineHandover = {
	fromStage: string;
	toStage: string;
	fromRole: PipelineRole;
	toRole: PipelineRole;
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
 * Validates a proposed funnel without persisting it. Pipeline and stage rows
 * currently have no role/handover columns, so this is the safe contract for
 * clients building a configuration before the ontology migration lands.
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
	} else if (terminalTypes.size === 0) {
		errors.push({
			path: "type",
			message: "A side bowtie needs at least one outcome branch.",
		});
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
