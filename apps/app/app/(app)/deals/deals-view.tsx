"use client";

import Column from "@carbon/icons-react/es/Column";
import List from "@carbon/icons-react/es/List";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Empty } from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import {
	closeReasonParams,
	DealStageMenu,
} from "@/components/crm/stage-change";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { dealsSearchParams } from "./deals-search-params";
import { DealsTable } from "./deals-table";

const VIEWS = ["table", "kanban"] as const;
type BoardDeal = RouterOutputs["deals"]["board"]["deals"][number];

export function DealsView() {
	const [view, setView] = useQueryState(
		"view",
		parseAsStringLiteral(VIEWS).withDefault("table"),
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="flex justify-end">
				<ToggleGroup
					type="single"
					value={view}
					onValueChange={(next) =>
						next && setView(next as (typeof VIEWS)[number])
					}
					variant="outline"
					size="sm"
					spacing={0}
				>
					<ToggleGroupItem value="table" aria-label="Table view">
						<Icon icon={List} /> Table
					</ToggleGroupItem>
					<ToggleGroupItem value="kanban" aria-label="Kanban view">
						<Icon icon={Column} /> Kanban
					</ToggleGroupItem>
				</ToggleGroup>
			</div>
			{view === "kanban" ? <DealsKanban /> : <DealsTable />}
		</div>
	);
}

function DealsKanban() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();
	const { query, input } = useTableQuery(dealsSearchParams);
	const [, setCloseParams] = useQueryStates(closeReasonParams);
	const users = useQuery(trpc.users.list.queryOptions());
	const pipelines = useQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: false }),
	);
	const board = useQuery({
		...trpc.deals.board.queryOptions({
			q: input.q,
			owner: input.owner,
			pipeline: input.pipeline,
		}),
	});
	const setStage = useMutation(
		trpc.deals.setStage.mutationOptions({
			onSuccess: async (_, variables) => cache.deal(variables.id),
			onError: (error) => toast.error(error.message),
		}),
	);

	const move = (deal: BoardDeal, stageId: string) => {
		if (deal.stage.id === stageId) return;
		const target = board.data?.pipeline.stages.find(
			(stage) => stage.id === stageId,
		);
		if (!target) return;
		if (target.type === "LOST" || target.type === "UNQUALIFIED") {
			void setCloseParams({ closing: deal.id, closingStage: target.id });
			return;
		}
		setStage.mutate({ id: deal.id, stageId });
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<Input
					value={query.q}
					onChange={(event) => query.setSearch(event.target.value)}
					placeholder="Search deals by name or company…"
					className="max-w-sm"
				/>
				<Select
					value={input.pipeline}
					onValueChange={(value) => query.setFilter("pipeline", value)}
				>
					<SelectTrigger aria-label="Pipeline">
						<SelectValue placeholder="Pipeline" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Default pipeline</SelectItem>
						{(pipelines.data ?? []).map((pipeline) => (
							<SelectItem key={pipeline.id} value={pipeline.id}>
								{pipeline.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={input.owner}
					onValueChange={(value) => query.setFilter("owner", value)}
				>
					<SelectTrigger aria-label="Owner">
						<SelectValue placeholder="Owner" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All owners</SelectItem>
						{(users.data ?? []).map((user) => (
							<SelectItem key={user.id} value={user.id}>
								{user.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{board.isFetching ? <Spinner /> : null}
			</div>

			{board.data ? (
				<>
					{board.data.truncated ? (
						<div
							role="status"
							className="rounded-md border bg-muted/40 px-3 py-2 text-sm"
						>
							Showing the first 1,000 deals. Narrow the search or owner filter
							to work with the remaining cards.
						</div>
					) : null}
					<div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
						{board.data.pipeline.stages.map((stage) => {
							const deals = board.data.deals.filter(
								(deal) => deal.stage.id === stage.id,
							);
							return (
								<Card
									key={stage.id}
									className="w-72 shrink-0"
									onDragOver={(event) => event.preventDefault()}
									onDrop={(event) => {
										const id = event.dataTransfer.getData("text/crm-deal");
										const deal = board.data.deals.find(
											(item) => item.id === id,
										);
										if (deal) move(deal, stage.id);
									}}
								>
									<CardHeader>
										<CardTitle>
											{stage.name} · {deals.length}
										</CardTitle>
									</CardHeader>
									<div className="flex flex-col gap-2">
										{deals.map((deal) => (
											<CardContent key={deal.id}>
												<article
													aria-label={`Drag ${deal.name} to another stage`}
													draggable
													onDragStart={(event) =>
														event.dataTransfer.setData("text/crm-deal", deal.id)
													}
												>
													<button
														type="button"
														className="w-full text-left"
														onClick={() =>
															openRecord({ kind: "deal", id: deal.id })
														}
													>
														<span className="block font-medium">
															{deal.name}
														</span>
														<span className="block text-muted-foreground text-xs">
															{deal.company.name}
														</span>
													</button>
													<div className="flex items-center justify-between gap-2 text-xs">
														<span>
															{deal.amountCents === null
																? "No value"
																: formatMoney(deal.amountCents, deal.currency)}
														</span>
														<DealStageMenu
															dealId={deal.id}
															stage={deal.stage}
														/>
													</div>
													<span className="text-muted-foreground text-xs">
														{deal.owner.name}
														{deal.expectedCloseDate
															? ` · ${new Date(deal.expectedCloseDate).toLocaleDateString()}`
															: ""}
													</span>
												</article>
											</CardContent>
										))}
									</div>
								</Card>
							);
						})}
					</div>
				</>
			) : (
				<Empty>No pipeline available.</Empty>
			)}
		</div>
	);
}
