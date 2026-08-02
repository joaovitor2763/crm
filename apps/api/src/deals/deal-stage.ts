import { PipelineStageType } from "@crm/db";

export function isClosedStage(type: PipelineStageType): boolean {
	return type !== PipelineStageType.OPEN;
}

export function isLosingStage(type: PipelineStageType): boolean {
	return (
		type === PipelineStageType.LOST || type === PipelineStageType.UNQUALIFIED
	);
}
