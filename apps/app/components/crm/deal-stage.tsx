import type { PipelineStageType } from "@crm/db/enums";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";

export type DealStage = {
	id: string;
	name: string;
	position: number;
	type: PipelineStageType;
};

const LEGACY_STAGE_LABELS: Record<string, string> = {
	DEMO_BOOKED: "Demo booked",
	QUALIFIED_TO_BUY: "Qualified to buy",
	DECISION_MAKER_BOUGHT_IN: "Decision maker in",
	DECISION_MAKER_IN: "Decision maker in",
	CONTRACT_SENT: "Contract sent",
	CLOSED_WON: "Closed won",
	CLOSED_LOST: "Closed lost",
	UNQUALIFIED_TO_BUY: "Unqualified",
	UNQUALIFIED: "Unqualified",
};

export function isClosedStage(stage: DealStage): boolean {
	return stage.type !== "OPEN";
}

export function isLosingStage(stage: DealStage): boolean {
	return stage.type === "LOST" || stage.type === "UNQUALIFIED";
}

export function dealStageColor(stage: DealStage): string {
	return `var(--chart-${(stage.position % 5) + 1})`;
}

export function dealStageLabel(stage: DealStage | string): string {
	return typeof stage === "string"
		? (LEGACY_STAGE_LABELS[stage] ?? stage)
		: stage.name;
}

function stageTone(type: PipelineStageType): StatusTone {
	switch (type) {
		case "WON":
			return "success";
		case "LOST":
			return "error";
		case "UNQUALIFIED":
			return "neutral";
		case "OPEN":
			return "info";
	}
}

export function DealStageIndicator({
	stage,
	className,
}: {
	stage: DealStage;
	className?: string;
}) {
	return (
		<StatusIndicator
			tone={stageTone(stage.type)}
			label={stage.name}
			className={className}
		/>
	);
}
