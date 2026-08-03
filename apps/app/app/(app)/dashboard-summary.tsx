"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import { CardTableEmpty } from "@crm/ui/components/card-table";
import { Checkbox } from "@crm/ui/components/checkbox";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import {
	formatCount,
	formatMoneyCompact,
	relativeTimeFromIso,
} from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import type { CSSProperties } from "react";
import { toast } from "sonner";
import {
	DealStageIndicator,
	dealStageColor,
} from "@/components/crm/deal-stage";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { activityLabel } from "@/components/crm/timeline/activity-icon";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { overviewParsers } from "./overview-search-params";
import { SalesDashboard } from "./sales-dashboard";

/**
 * Cell padding, in one constant.
 *
 * `SimpleTable` sets its own header padding and leaves the body to the caller,
 * so a table where one column forgot `py-2.5` is a row half a line taller than
 * the ones around it — which is most of what made these lists look ragged.
 */
const CELL = "px-3 py-2.5 align-middle";

/**
 * Every list on the overview is a table: a header row naming the columns, rows
 * divided by hairlines, and no icon in the leading cell. A glyph per row is
 * what this page deliberately does not do.
 *
 * The two panels below the charts are framed and set to one height because
 * their rows scroll; the activity log at the bottom is unframed and runs as
 * long as it needs to, because nothing sits beside it to end level with.
 */
export function DashboardSummary() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();

	// Read, not written, here: the toggle in the page header owns the setter, and
	// both sides agree because the value lives in the URL rather than in a
	// provider threaded between them.
	const [scope] = useQueryState("scope", overviewParsers.scope);

	const summaryQuery = useQuery({
		...trpc.dashboard.summary.queryOptions({ scope }),
		// Switching scope keeps the previous numbers on screen while the new ones
		// load, the same way the tables hold their rows while paging.
		placeholderData: (previous) => previous,
	});
	const tasksQuery = useQuery(
		trpc.activities.myTasks.queryOptions({ window: "all", limit: 10 }),
	);

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(error.message),
		}),
	);

	const summary = summaryQuery.data;

	if (!summary) {
		return (
			<div className="flex flex-1 justify-center py-12">
				<Spinner />
			</div>
		);
	}

	const { biggestOpen, recentActivity } = summary;
	const openTasks = tasksQuery.data?.rows ?? [];
	const openTaskCount = tasksQuery.data?.total ?? 0;
	const overdueCount = tasksQuery.data?.overdue ?? 0;

	const mine = scope === "me";
	const largestOpenCents = biggestOpen[0]?.amountCents ?? 0;

	const openColumns: SimpleTableColumn[] = [
		{ header: "Deal" },
		{ header: "Stage", width: "w-32", className: "hidden lg:table-cell" },
		{
			srLabel: "Share of the largest",
			width: "w-24",
			className: "hidden sm:table-cell",
		},
		{ header: "Value", width: "w-20", align: "right" },
	];

	const taskColumns: SimpleTableColumn[] = [
		{ srLabel: "Done", width: "w-8" },
		{ header: "Task" },
		{ header: "Due", width: "w-24", align: "right" },
	];

	const activityColumns: SimpleTableColumn[] = [
		{ header: "Activity" },
		{ header: "Company", width: "w-44", className: "hidden md:table-cell" },
		{ header: "Deal", width: "w-48", className: "hidden lg:table-cell" },
		{ header: "Who", width: "w-32", className: "hidden md:table-cell" },
		{ header: "When", width: "w-20", align: "right" },
	];

	return (
		<div className="flex flex-col gap-6">
			<SalesDashboard summary={summary} />

			{/*
			 * Two panels of one fixed height rather than four cards that each grew
			 * to fit their rows: the pair always ends level, and the activity list
			 * below them stays where a rep last saw it however many deals are open.
			 */}
			<div className="grid gap-6 @3xl/page-content:grid-cols-2">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Deals in progress</CardTitle>
						<CardDescription>
							The largest open deals, and how long each has sat in its stage
						</CardDescription>
						<CardAction>
							<Button asChild variant="ghost" size="sm">
								<Link href="/deals">Open deals</Link>
							</Button>
						</CardAction>
					</CardHeader>
					<CardPanel>
						{biggestOpen.length === 0 ? (
							<CardPanelEmpty>
								Nothing open. Time to fill the pipeline.
							</CardPanelEmpty>
						) : (
							<SimpleTable variant="panel" surface="page" columns={openColumns}>
								{biggestOpen.map((deal) => (
									<SimpleTableRow
										key={deal.id}
										clickable
										onClick={() => openRecord({ kind: "deal", id: deal.id })}
									>
										<TableCell className={CELL}>
											<DealCell
												name={deal.name}
												company={deal.company.name}
												// Rendered on the server and again in the browser,
												// often a minute apart — the text is meant to drift.
												meta={relativeTimeFromIso(deal.stageChangedAt)}
											/>
										</TableCell>
										<TableCell className={`${CELL} hidden lg:table-cell`}>
											<DealStageIndicator stage={deal.stage} />
										</TableCell>
										<TableCell className={`${CELL} hidden sm:table-cell`}>
											<ValueMeter
												share={
													largestOpenCents > 0
														? ((deal.amountCents ?? 0) / largestOpenCents) * 100
														: 0
												}
												color={dealStageColor(deal.stage)}
											/>
										</TableCell>
										<TableCell className={`${CELL} text-right tabular-nums`}>
											{deal.amountCents === null ? (
												<EmptyCellValue />
											) : (
												formatMoneyCompact(deal.amountCents, deal.currency)
											)}
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</CardPanel>
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Open tasks</CardTitle>
						<CardDescription>
							{openTasks.length === 0
								? "No unfinished tasks"
								: overdueCount > 0
									? `${formatCount(overdueCount, "task")} overdue · ${formatCount(openTaskCount, "open task")}`
									: `${formatCount(openTaskCount, "open task")} · nothing overdue`}
						</CardDescription>
					</CardHeader>
					<CardPanel
						className={
							openTasks.length === 0 ? "h-40 @3xl/page-content:h-80" : undefined
						}
					>
						{openTasks.length === 0 ? (
							<CardPanelEmpty className="min-h-32">
								No open tasks. Add one from the Activity tab on a deal or
								contact.
							</CardPanelEmpty>
						) : (
							<SimpleTable variant="panel" surface="page" columns={taskColumns}>
								{openTasks.map((task) => {
									const overdue =
										task.dueAt && new Date(task.dueAt) < new Date();
									return (
										<SimpleTableRow key={task.id}>
											<TableCell className={CELL}>
												<Checkbox
													checked={false}
													disabled={complete.isPending}
													aria-label="Mark as done"
													onCheckedChange={() =>
														complete.mutate({ id: task.id, completed: true })
													}
												/>
											</TableCell>
											<TableCell className={CELL}>
												<span className="flex min-w-0 flex-col">
													<span className="truncate">{task.subject}</span>
													<span className="flex min-w-0 text-muted-foreground">
														{task.deal ? (
															<RecordLink kind="deal" id={task.deal.id}>
																{task.deal.name}
															</RecordLink>
														) : task.contact ? (
															<RecordLink kind="contact" id={task.contact.id}>
																{[task.contact.firstName, task.contact.lastName]
																	.filter(Boolean)
																	.join(" ")}
															</RecordLink>
														) : task.company ? (
															<RecordLink kind="company" id={task.company.id}>
																{task.company.name}
															</RecordLink>
														) : null}
													</span>
												</span>
											</TableCell>
											<TableCell className={`${CELL} text-right`}>
												{task.dueAt ? (
													<StatusIndicator
														tone={overdue ? "error" : "info"}
														label={relativeTimeFromIso(task.dueAt)}
													/>
												) : (
													<span className="text-muted-foreground">Someday</span>
												)}
											</TableCell>
										</SimpleTableRow>
									);
								})}
							</SimpleTable>
						)}
					</CardPanel>
				</Card>
			</div>

			<Card className="min-w-0">
				<CardHeader>
					<CardTitle>
						{mine ? "Your recent activity" : "Recent activity"}
					</CardTitle>
					<CardDescription>
						{mine
							? "Every note, task and stage change you have logged"
							: "Every note, task and stage change across the workspace"}
					</CardDescription>
					<CardAction>
						<Button asChild variant="ghost" size="sm">
							<Link href="/companies">All companies</Link>
						</Button>
					</CardAction>
				</CardHeader>
				{recentActivity.length === 0 ? (
					<CardTableEmpty>Nothing has happened yet.</CardTableEmpty>
				) : (
					<SimpleTable columns={activityColumns}>
						{recentActivity.map((entry) => (
							<SimpleTableRow key={entry.id}>
								<TableCell className={CELL}>
									<span className="truncate">
										{entry.subject ?? activityLabel(entry.type)}
									</span>
								</TableCell>
								<TableCell className={`${CELL} hidden md:table-cell`}>
									{entry.company ? (
										<RecordLink kind="company" id={entry.company.id}>
											{entry.company.name}
										</RecordLink>
									) : (
										<EmptyCellValue />
									)}
								</TableCell>
								<TableCell className={`${CELL} hidden lg:table-cell`}>
									{entry.deal ? (
										<RecordLink kind="deal" id={entry.deal.id}>
											{entry.deal.name}
										</RecordLink>
									) : (
										<EmptyCellValue />
									)}
								</TableCell>
								<TableCell
									className={`${CELL} hidden truncate text-muted-foreground md:table-cell`}
								>
									{entry.createdBy.name}
								</TableCell>
								<TableCell
									className={`${CELL} text-right text-muted-foreground`}
								>
									{/* Rendered on the server and again in the browser, often a
									    minute apart — the text is meant to drift. */}
									<span suppressHydrationWarning>
										{relativeTimeFromIso(entry.createdAt)}
									</span>
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</Card>
		</div>
	);
}

/**
 * A deal's name over the account it belongs to — two lines in one cell, so the
 * table keeps four columns in a half-width panel instead of seven.
 */
function DealCell({
	name,
	company,
	meta,
}: {
	name: string;
	company: string;
	meta?: string;
}) {
	return (
		<span className="flex min-w-0 flex-col">
			<span className="truncate font-medium">{name}</span>
			<span className="truncate text-muted-foreground" suppressHydrationWarning>
				{meta ? `${company} · ${meta}` : company}
			</span>
		</span>
	);
}

/**
 * A deal's or a rep's share of the biggest one on the list.
 *
 * The same bar the charts use, in plain HTML: `bloom-*` is a theme-independent
 * utility in `globals.css` precisely so a meter beside a row matches the plot
 * above it. Hidden below `sm`, where the number alone has to carry it.
 */
function ValueMeter({ share, color }: { share: number; color: string }) {
	return (
		<span
			className="bloom-low flex h-1.5 w-full overflow-hidden bg-muted"
			style={{ "--bloom-color": color } as CSSProperties}
		>
			<span
				className="h-full w-(--share)"
				style={
					{
						backgroundColor: color,
						// Rounded: a bar 24px wide cannot render the difference, and the
						// raw ratio puts fourteen decimal places in the markup.
						"--share": `${Math.round(Math.max(Math.min(share, 100), 0))}%`,
					} as CSSProperties
				}
			/>
		</span>
	);
}
