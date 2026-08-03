"use client";

import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import type { ChartConfig } from "@crm/ui/components/chart";
import { DashboardRow, StatGroup } from "@crm/ui/components/dashboard";
import { StatCard, type StatDelta } from "@crm/ui/components/stat-card";
import {
	formatCount,
	formatMoney,
	formatMoneyCompact,
	formatPercent,
} from "@crm/ui/lib/format";
import Link from "next/link";
import type { ReactNode } from "react";
import { dealStageColor, dealStageLabel } from "@/components/crm/deal-stage";
import { AreaTrend, DonutStat } from "@/components/dashboard-charts";
import type { RouterOutputs } from "@/lib/trpc/types";

type Summary = RouterOutputs["dashboard"]["summary"];

/**
 * Won is the outcome, created is the input that produces it six weeks later.
 * `--success` for the first because a rep already reads green as "closed"; the
 * chart ramp for the second because it is a leading indicator, not a verdict.
 */
const TREND_CONFIG: ChartConfig = {
	won: { label: "Closed won", color: "var(--success)" },
	created: { label: "New pipeline", color: "var(--chart-1)" },
};

/**
 * Percentage change, or nothing.
 *
 * With no baseline there is no percentage to quote — "+100%" against a month
 * where nothing closed is arithmetic, not information.
 */
function changeDelta(
	current: number,
	previous: number,
	label: string,
): StatDelta | undefined {
	if (previous === 0) return undefined;
	const change = Math.round(((current - previous) / previous) * 100);
	return {
		value: `${change >= 0 ? "+" : ""}${change}%`,
		direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
		label,
	};
}

/**
 * The KPI strip and the two charts behind it: six months of closed-won against
 * new pipeline, and where the open pipeline currently sits.
 */
export function SalesDashboard({
	summary,
	timeSeries,
	window,
}: {
	summary: Summary;
	timeSeries?: Array<Record<string, string | number | null>>;
	window?: { from: string; to: string };
}) {
	const {
		pipeline,
		wonThisMonth,
		wonPrevMonth,
		performance,
		trend,
		closingThisMonthTotal,
	} = summary;

	const selectedTrend =
		timeSeries?.map((row) => ({
			month: String(row.period ?? ""),
			won: Number(row.won ?? 0),
			created: Number(row.created ?? 0),
		})) ?? trend;
	const hasTrend = selectedTrend.some(
		(point) => point.won > 0 || point.created > 0,
	);
	const customTrend = Boolean(timeSeries);

	const stageSlices = pipeline.stages
		.map((stage) => ({
			key: stage.stage.id,
			label: dealStageLabel(stage.stage),
			value: stage.valueCents,
			color: dealStageColor(stage.stage),
			count: stage.count,
		}))
		.filter((slice) => slice.value > 0);

	return (
		<div className="flex flex-col gap-6">
			<StatGroup>
				<StatCard
					label="Closed won this month"
					value={formatMoneyCompact(wonThisMonth.valueCents)}
					delta={changeDelta(
						wonThisMonth.valueCents,
						wonPrevMonth.valueCents,
						"vs. last month",
					)}
					description={`${formatCount(wonThisMonth.count, "deal")} · ${formatMoneyCompact(wonPrevMonth.valueCents)} last month`}
				/>
				<StatCard
					label="Open pipeline"
					value={formatMoneyCompact(pipeline.totalCents)}
					description={`${formatCount(pipeline.totalDeals, "deal")} in progress · ${formatMoneyCompact(closingThisMonthTotal.valueCents)} due this month`}
				/>
				<StatCard
					label={`Win rate (${performance.windowDays}d)`}
					value={
						performance.winRate === null
							? "—"
							: formatPercent(performance.winRate)
					}
					description={
						performance.wins + performance.losses === 0
							? "Nothing has closed yet"
							: `${performance.wins} won · ${performance.losses} lost`
					}
				/>
				<StatCard
					label={`Average deal (${performance.windowDays}d)`}
					value={
						performance.avgDealCents === null
							? "—"
							: formatMoneyCompact(performance.avgDealCents)
					}
					description={
						performance.avgCycleDays === null
							? "No wins to measure"
							: `${performance.avgCycleDays}-day average cycle`
					}
				/>
			</StatGroup>

			<DashboardRow split="hero">
				<ChartPanel
					title="Closed won vs. new pipeline"
					description={
						customTrend && window
							? "Selected date window, using the chosen aggregation"
							: "Last six months, by the month a deal closed or was created"
					}
				>
					{hasTrend ? (
						<div className="flex flex-1 flex-col justify-center py-4">
							<AreaTrend
								data={selectedTrend}
								config={TREND_CONFIG}
								xKey="month"
								height={196}
								variant="gradient"
								bloom="high"
								showLegend
								formatValue={(value) =>
									customTrend
										? formatCount(Number(value), "deal")
										: formatMoney(
												typeof value === "number" ? value : Number(value),
											)
								}
							/>
						</div>
					) : (
						<EmptyChart label="No deals closed or created yet" />
					)}
				</ChartPanel>

				<ChartPanel
					title="Open pipeline by stage"
					description="Where the value sits right now"
				>
					{stageSlices.length > 0 ? (
						<div className="flex flex-1 flex-col justify-between gap-1 pt-4">
							<DonutStat
								data={stageSlices}
								height={168}
								centerValue={formatMoneyCompact(pipeline.totalCents)}
								centerLabel="open"
								formatValue={(value) =>
									formatMoney(typeof value === "number" ? value : Number(value))
								}
							/>
							{/*
							 * A legend of links rather than `onSliceClick`: clicking a
							 * wedge is pointer-only, and "show me the contracts I have
							 * out" is the most likely thing a rep wants from this chart.
							 */}
							<ul className="flex flex-col px-5 pb-1 md:px-6">
								{stageSlices.map((slice) => (
									<li key={slice.key} className="border-t first:border-t-0">
										<Link
											href={`/deals?stage=${slice.key}`}
											className="flex items-center gap-2.5 py-2 text-xs hover:underline"
										>
											<span
												aria-hidden
												className="size-1.5 shrink-0"
												style={{ backgroundColor: slice.color }}
											/>
											<span className="min-w-0 flex-1 truncate">
												{slice.label}
											</span>
											<span className="shrink-0 text-muted-foreground tabular-nums">
												{slice.count}
											</span>
											<span className="w-14 shrink-0 text-right font-medium tabular-nums">
												{formatMoneyCompact(slice.value)}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</div>
					) : (
						<EmptyChart label="Nothing open" />
					)}
				</ChartPanel>
			</DashboardRow>
		</div>
	);
}

/**
 * A titled, framed plot, built from the same `Card` header the lists below the
 * charts use so every section on the page shares one heading rhythm.
 *
 * The body keeps a border where a list does not: a chart floating against the
 * page with no frame reads as unmoored, and `flex-1` makes both columns of a
 * row end level however tall their plots are.
 */
function ChartPanel({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<Card className="min-w-0">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
			<div className="flex flex-1 flex-col border">{children}</div>
		</Card>
	);
}

function EmptyChart({ label }: { label: string }) {
	return (
		<div className="flex flex-1 items-center justify-center px-5 py-10 text-muted-foreground text-sm md:px-6">
			{label}
		</div>
	);
}
