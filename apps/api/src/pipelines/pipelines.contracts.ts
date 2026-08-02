import { PipelineStageType } from "@crm/db";
import { z } from "zod";

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
});

export const pipelineUpdateInput = z.object({
	id: z.string(),
	name: z.string().trim().min(1).optional(),
	isDefault: z.boolean().optional(),
});

export const pipelineIdInput = z.object({ id: z.string() });

export const pipelineStageCreateInput = z.object({
	pipelineId: z.string(),
	name: z.string().trim().min(1, "A stage needs a name."),
	type: stageType.default(PipelineStageType.OPEN),
});

export const pipelineStageUpdateInput = z.object({
	id: z.string(),
	name: z.string().trim().min(1).optional(),
	type: stageType.optional(),
});

export const pipelineStageReorderInput = z.object({
	pipelineId: z.string(),
	stageIds: z.array(z.string()).min(1),
});

export const pipelineStageIdInput = z.object({ id: z.string() });
