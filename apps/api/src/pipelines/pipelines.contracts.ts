import { PipelineStageType } from "@crm/db";
import { z } from "zod";
import {
	pipelineBlueprintInput,
	pipelineFunnelType,
	pipelineRole,
} from "./pipelines-blueprint.contracts";

const stageType = z.enum(
	Object.values(PipelineStageType) as [
		PipelineStageType,
		...PipelineStageType[],
	],
);

export const pipelineListInput = z.object({
	includeArchived: z.boolean().default(false),
});

export const pipelineCreateInput = z.object({
	name: z.string().trim().min(1, "A pipeline needs a name."),
	businessUnitId: z.string().nullable().optional(),
	funnelType: pipelineFunnelType.default("full_bowtie"),
});

export const pipelineUpdateInput = z.object({
	id: z.string(),
	name: z.string().trim().min(1).optional(),
	isDefault: z.boolean().optional(),
});

export const pipelineBlueprintUpdateInput = z.object({
	id: z.string(),
	blueprint: pipelineBlueprintInput,
});

export const pipelineIdInput = z.object({ id: z.string() });

export const pipelineStageCreateInput = z.object({
	pipelineId: z.string(),
	name: z.string().trim().min(1, "A stage needs a name."),
	type: stageType.default(PipelineStageType.OPEN),
	key: z.string().trim().min(1).max(80).optional(),
	semanticPhase: z.string().trim().min(1).max(80).optional(),
	allowedRoles: z.array(pipelineRole).min(1).optional(),
	responsibleRole: pipelineRole.optional(),
	defaultResponsibleRole: pipelineRole.optional(),
	allowedNextStages: z.array(z.string().trim().min(1)).optional(),
});

export const pipelineStageUpdateInput = z.object({
	id: z.string(),
	name: z.string().trim().min(1).optional(),
	type: stageType.optional(),
	key: z.string().trim().min(1).max(80).optional(),
	semanticPhase: z.string().trim().min(1).max(80).optional(),
	allowedRoles: z.array(pipelineRole).min(1).optional(),
	responsibleRole: pipelineRole.nullable().optional(),
	defaultResponsibleRole: pipelineRole.nullable().optional(),
	allowedNextStages: z.array(z.string().trim().min(1)).optional(),
});

export const pipelineStageReorderInput = z.object({
	pipelineId: z.string(),
	stageIds: z.array(z.string()).min(1),
});

export const pipelineStageIdInput = z.object({ id: z.string() });

export const pipelineBlueprintValidationInput = pipelineBlueprintInput;

export const pipelineBlueprintTransitionInput = z.object({
	blueprint: pipelineBlueprintInput,
	fromStage: z.string().trim().min(1),
	toStage: z.string().trim().min(1),
	actingRole: pipelineRole.optional(),
	handoverToRole: pipelineRole.optional(),
	handoverAccepted: z.boolean().optional(),
});
