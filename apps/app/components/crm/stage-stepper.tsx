"use client";

import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	type DealStage,
	DealStageIndicator,
} from "@/components/crm/deal-stage";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function StageStepper({
	dealId,
	pipelineId,
	stage,
}: {
	dealId: string;
	pipelineId: string;
	stage: DealStage;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const pipelines = useQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: false }),
	);
	const setStage = useMutation(
		trpc.deals.setStage.mutationOptions({
			onSuccess: async (result) => {
				await cache.deal(dealId);
				if (result.changed) toast.success("Stage updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const pipeline = pipelines.data?.find((item) => item.id === pipelineId);
	const steps = pipeline?.stages.filter(
		(option) => option.type === "OPEN" || option.type === "WON",
	) ?? [stage];
	const currentIndex = steps.findIndex((option) => option.id === stage.id);
	const exited = stage.type === "LOST" || stage.type === "UNQUALIFIED";

	return (
		<ol className="flex w-full gap-1">
			{steps.map((option, index) => {
				const reached = !exited && index <= currentIndex;
				const current = option.id === stage.id;
				return (
					<li key={option.id} className="flex min-w-0 flex-1">
						<button
							type="button"
							aria-current={current ? "step" : undefined}
							disabled={setStage.isPending}
							onClick={() =>
								setStage.mutate({ id: dealId, stageId: option.id })
							}
							className={cn(
								"min-w-0 flex-1 border-t-2 pt-2 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-50",
								reached
									? "border-foreground text-foreground"
									: "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
								current && "font-medium",
							)}
						>
							<span className="block truncate">{option.name}</span>
						</button>
					</li>
				);
			})}
			{exited ? (
				<li className="flex min-w-0 flex-1">
					<div className="min-w-0 flex-1 border-foreground border-t-2 pt-2">
						<DealStageIndicator stage={stage} className="text-xs" />
					</div>
				</li>
			) : null}
		</ol>
	);
}
