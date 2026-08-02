import { PipelineStageType } from "@crm/db";
import { z } from "zod";
import {
	PIPELINE_FUNNEL_TYPES,
	type PipelineBlueprint,
} from "./pipeline-blueprint";

const funnelType = z.enum(PIPELINE_FUNNEL_TYPES);
export const pipelineRole = z.string().trim().min(1).max(80);
const stageType = z.enum([
	PipelineStageType.OPEN,
	PipelineStageType.WON,
	PipelineStageType.LOST,
	PipelineStageType.UNQUALIFIED,
] as const);

export const pipelineBlueprintInput = z.object({
	type: funnelType,
	stages: z
		.array(
			z.object({
				key: z.string().trim().min(1).max(80),
				position: z.number().int().min(0),
				type: stageType,
				allowedRoles: z.array(pipelineRole).min(1),
				responsibleRole: pipelineRole,
				allowedNextStages: z.array(z.string().trim().min(1)).optional(),
			}),
		)
		.min(1),
	handovers: z
		.array(
			z.object({
				fromStage: z.string().trim().min(1),
				toStage: z.string().trim().min(1),
				fromRole: pipelineRole,
				toRole: pipelineRole,
			}),
		)
		.default([]),
});

export type PipelineBlueprintInput = z.infer<typeof pipelineBlueprintInput>;
export type PipelineBlueprintContract = PipelineBlueprint;
