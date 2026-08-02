"use client";

import Column from "@carbon/icons-react/es/Column";
import Information from "@carbon/icons-react/es/Information";
import List from "@carbon/icons-react/es/List";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Card, CardContent } from "@crm/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Separator } from "@crm/ui/components/separator";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { formatDay, formatMoney } from "@crm/ui/lib/format";
import { cn } from "@crm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import type { DealStage } from "@/components/crm/deal-stage";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import {
	closeReasonParams,
	DealStageMenu,
} from "@/components/crm/stage-change";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { dealsSearchParams, dealsViewParsers } from "./deals-search-params";
import { DealsTable } from "./deals-table";

type BoardDeal = {
	id: string;
	name: string;
	amountCents: number | null;
	currency: string;
	company: { name: string };
	stage: DealStage;
	owner: { name: string };
	expectedCloseDate: string | null;
};

type BoardData = {
	truncated: boolean;
	pipeline: { stages: DealStage[] };
	deals: BoardDeal[];
};

export function DealsView() {
	const [{ view }, setViewState] = useQueryStates(dealsViewParsers);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-xs">
					Choose the view that matches the task.
				</p>
				<ToggleGroup
					type="single"
					value={view}
					onValueChange={(next) => {
						if (next === "table" || next === "kanban") {
							void setViewState({ view: next });
						}
					}}
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
	const [{ boardStage }, setViewState] = useQueryStates(dealsViewParsers);
	const [, setCloseParams] = useQueryStates(closeReasonParams);
	const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
	const [dropStageId, setDropStageId] = useState<string | null>(null);
	const users = useQuery(trpc.users.list.queryOptions());
	const pipelines = useQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: false }),
	);
	const board = useQuery(
		trpc.deals.board.queryOptions({
			q: input.q,
			owner: input.owner,
			pipeline: input.pipeline,
		}),
	);
	const boardData = board.data as unknown as BoardData | undefined;
	const setStage = useMutation(
		trpc.deals.setStage.mutationOptions({
			onSuccess: async (_, variables) => cache.deal(variables.id),
			onError: (error) => toast.error(error.message),
		}),
	);
	const activeStage =
		boardData?.pipeline.stages.find((stage) => stage.id === boardStage) ??
		boardData?.pipeline.stages[0];

	const move = (deal: BoardDeal, stageId: string) => {
		if (deal.stage.id === stageId) return;
		const target = boardData?.pipeline.stages.find(
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
			<div className="grid gap-2 sm:grid-cols-[minmax(16rem,1fr)_auto_auto]">
				<Input
					value={query.q}
					onChange={(event) => query.setSearch(event.target.value)}
					placeholder="Search deals by name or company…"
					aria-label="Search deals"
				/>
				<Select
					value={input.pipeline}
					onValueChange={(value) => {
						void query.setFilter("pipeline", value);
						void setViewState({ boardStage: null });
					}}
				>
					<SelectTrigger aria-label="Pipeline" className="w-full sm:w-auto">
						<SelectValue placeholder="Pipeline" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">Default pipeline</SelectItem>
							{(pipelines.data ?? []).map((pipeline) => (
								<SelectItem key={pipeline.id} value={pipeline.id}>
									{pipeline.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Select
					value={input.owner}
					onValueChange={(value) => query.setFilter("owner", value)}
				>
					<SelectTrigger aria-label="Owner" className="w-full sm:w-auto">
						<SelectValue placeholder="Owner" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">All owners</SelectItem>
							{(users.data ?? []).map((user) => (
								<SelectItem key={user.id} value={user.id}>
									{user.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			{boardData?.truncated ? (
				<Alert>
					<Icon icon={Information} />
					<AlertTitle>Showing the first 1,000 deals</AlertTitle>
					<AlertDescription>
						Narrow the search or owner filter to work with the remaining cards.
					</AlertDescription>
				</Alert>
			) : null}

			{board.isPending ? (
				<Empty className="flex-1">
					<EmptyHeader>
						<EmptyMedia>
							<Spinner />
						</EmptyMedia>
						<EmptyTitle>Loading pipeline…</EmptyTitle>
					</EmptyHeader>
				</Empty>
			) : board.isError ? (
				<Empty className="flex-1">
					<EmptyHeader>
						<EmptyTitle>Could not load the pipeline</EmptyTitle>
						<EmptyDescription>{board.error.message}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : boardData && activeStage ? (
				<>
					<nav
						aria-label="Pipeline stages"
						className="flex shrink-0 overflow-x-auto border-b md:hidden"
					>
						{boardData.pipeline.stages.map((stage) => {
							const count = boardData.deals.filter(
								(deal) => deal.stage.id === stage.id,
							).length;
							const active = stage.id === activeStage.id;
							return (
								<button
									key={stage.id}
									type="button"
									aria-current={active ? "page" : undefined}
									className={cn(
										"min-h-11 shrink-0 touch-manipulation border-b-2 border-transparent px-3 text-muted-foreground text-xs outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
										active && "border-primary text-foreground",
									)}
									onClick={() => void setViewState({ boardStage: stage.id })}
								>
									{stage.name} · {count}
								</button>
							);
						})}
					</nav>

					<div className="min-h-0 flex-1 md:hidden">
						<KanbanColumn
							stage={activeStage}
							deals={boardData.deals.filter(
								(deal) => deal.stage.id === activeStage.id,
							)}
							allDeals={boardData.deals}
							draggingDealId={draggingDealId}
							dropStageId={dropStageId}
							setDraggingDealId={setDraggingDealId}
							setDropStageId={setDropStageId}
							onMove={move}
							onOpen={(id) => openRecord({ kind: "deal", id })}
						/>
					</div>

					<div className="hidden min-h-0 flex-1 gap-3 overflow-x-auto pb-2 md:flex">
						{boardData.pipeline.stages.map((stage) => (
							<KanbanColumn
								key={stage.id}
								stage={stage}
								deals={boardData.deals.filter(
									(deal) => deal.stage.id === stage.id,
								)}
								allDeals={boardData.deals}
								className="min-w-72 flex-1"
								draggingDealId={draggingDealId}
								dropStageId={dropStageId}
								setDraggingDealId={setDraggingDealId}
								setDropStageId={setDropStageId}
								onMove={move}
								onOpen={(id) => openRecord({ kind: "deal", id })}
							/>
						))}
					</div>
				</>
			) : (
				<Empty className="flex-1">
					<EmptyHeader>
						<EmptyTitle>No pipeline available</EmptyTitle>
						<EmptyDescription>
							Create a pipeline and its stages in Studio to start organizing
							deals.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}

function KanbanColumn({
	stage,
	deals,
	allDeals,
	className,
	draggingDealId,
	dropStageId,
	setDraggingDealId,
	setDropStageId,
	onMove,
	onOpen,
}: {
	stage: DealStage;
	deals: BoardDeal[];
	allDeals: BoardDeal[];
	className?: string;
	draggingDealId: string | null;
	dropStageId: string | null;
	setDraggingDealId: (id: string | null) => void;
	setDropStageId: (id: string | null) => void;
	onMove: (deal: BoardDeal, stageId: string) => void;
	onOpen: (id: string) => void;
}) {
	return (
		<section
			aria-labelledby={`stage-${stage.id}`}
			className={cn(
				"flex h-full min-h-0 flex-col border bg-background",
				dropStageId === stage.id && draggingDealId && "ring-1 ring-ring",
				className,
			)}
			onDragOver={(event) => {
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				setDropStageId(stage.id);
			}}
			onDrop={(event) => {
				event.preventDefault();
				const id = event.dataTransfer.getData("text/crm-deal");
				const deal = allDeals.find((item) => item.id === id);
				setDropStageId(null);
				setDraggingDealId(null);
				if (deal) onMove(deal, stage.id);
			}}
		>
			<header className="flex shrink-0 items-center justify-between gap-3 border-b p-3">
				<h2 id={`stage-${stage.id}`} className="truncate font-medium text-sm">
					{stage.name}
				</h2>
				<span className="tabular-nums text-muted-foreground text-xs">
					{deals.length}
				</span>
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
				{deals.length === 0 ? (
					<Empty className="flex-1">
						<EmptyHeader>
							<EmptyTitle>No deals in this stage</EmptyTitle>
							<EmptyDescription>
								Move a deal here or change its stage from the deal menu.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					deals.map((deal) => (
						<Card key={deal.id} className="gap-0">
							<CardContent>
								<article
									aria-label={`Deal ${deal.name}. Drag to move it to another stage, or use the stage menu.`}
									draggable
									className={cn(
										"flex min-w-0 flex-col gap-3",
										draggingDealId === deal.id && "opacity-50",
									)}
									onDragStart={(event) => {
										event.dataTransfer.effectAllowed = "move";
										event.dataTransfer.setData("text/crm-deal", deal.id);
										setDraggingDealId(deal.id);
									}}
									onDragEnd={() => {
										setDraggingDealId(null);
										setDropStageId(null);
									}}
								>
									<button
										type="button"
										className="flex min-h-11 touch-manipulation items-start justify-between gap-3 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
										onClick={() => onOpen(deal.id)}
									>
										<span className="min-w-0">
											<span className="block truncate font-medium text-sm">
												{deal.name}
											</span>
											<span className="block truncate text-muted-foreground text-xs">
												{deal.company.name}
											</span>
										</span>
										<span className="shrink-0 tabular-nums font-medium text-xs">
											{deal.amountCents === null
												? "No value"
												: formatMoney(deal.amountCents, deal.currency)}
										</span>
									</button>
									<Separator />
									<div className="flex min-w-0 items-center justify-between gap-3">
										<span className="min-w-0 truncate text-muted-foreground text-xs">
											{deal.owner.name}
											{deal.expectedCloseDate
												? ` · ${formatDay(deal.expectedCloseDate)}`
												: ""}
										</span>
										<DealStageMenu
											dealId={deal.id}
											stage={deal.stage}
											variant="icon"
										/>
									</div>
								</article>
							</CardContent>
						</Card>
					))
				)}
			</div>
		</section>
	);
}
