"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { DashboardSection } from "@crm/ui/components/dashboard";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { BarTrend } from "@/components/dashboard-charts";
import { useTRPC } from "@/lib/trpc/client";
import { OverviewScopeToggle } from "../overview-scope";
import { overviewParsers } from "../overview-search-params";
import { SalesDashboard } from "../sales-dashboard";
import { chartConfig, chartRows, formatMetric } from "./studio-analytics-data";
import { studioParsers } from "./studio-search-params";

const DIMENSIONS = [
	["channel", "Channel"],
	["owner", "Owner"],
	["utmSource", "UTM source"],
	["utmMedium", "UTM medium"],
	["utmCampaign", "UTM campaign"],
	["utmTerm", "UTM term"],
	["utmContent", "UTM content"],
	["dealAttribute", "Deal attribute"],
] as const;

const VIEW_LABELS = {
	conversionFunnel: "Conversion funnel",
	conversionTime: "Time to conversion",
	stagePerformance: "Stage performance",
	breakdown: "Breakdown",
} as const;

export function StudioDashboards() {
	const trpc = useTRPC();
	const [scope] = useQueryState("scope", overviewParsers.scope);
	const [view, setView] = useQueryState(
		"analyticsView",
		studioParsers.analyticsView,
	);
	const [dimension, setDimension] = useQueryState(
		"analyticsDimension",
		studioParsers.analyticsDimension,
	);
	const [pipeline, setPipeline] = useQueryState(
		"analyticsPipeline",
		studioParsers.analyticsPipeline,
	);
	const [attribute, setAttribute] = useQueryState(
		"analyticsAttribute",
		studioParsers.analyticsAttribute,
	);
	const summary = useQuery(trpc.dashboard.summary.queryOptions({ scope }));
	const pipelines = useQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: false }),
	);
	const analytics = useQuery({
		...trpc.dashboard.analytics.queryOptions({
			scope,
			pipelineId: pipeline === "all" ? undefined : pipeline,
			dimensions: [dimension],
			attributeKey:
				dimension === "dealAttribute" ? attribute || undefined : undefined,
			limit: 25,
		}),
		enabled: dimension !== "dealAttribute" || Boolean(attribute.trim()),
	});

	const selectedView =
		analytics.data?.views.find((item) => item.key === view) ??
		analytics.data?.views[0];
	return (
		<div className="flex flex-col gap-6">
			<DashboardSection
				title="Standard revenue views"
				description="Conversion, cycle time and attribution are calculated from the authorized deal activity window."
				action={<OverviewScopeToggle />}
			>
				{summary.data ? (
					<SalesDashboard summary={summary.data} />
				) : (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				)}
			</DashboardSection>

			<Card>
				<CardHeader>
					<CardTitle>Analytics builder</CardTitle>
					<CardDescription>
						Choose one governed cut for a standard view. Selections persist in
						the URL, so a view can be shared or revisited.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					<div className="grid gap-3 md:grid-cols-4 md:items-end">
						<Field>
							<FieldLabel>View</FieldLabel>
							<Select
								value={view}
								onValueChange={(value) => void setView(value as typeof view)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.entries(VIEW_LABELS).map(([key, label]) => (
										<SelectItem key={key} value={key}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel>Break down by</FieldLabel>
							<Select
								value={dimension}
								onValueChange={(value) =>
									void setDimension(value as typeof dimension)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DIMENSIONS.map(([key, label]) => (
										<SelectItem key={key} value={key}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel>Pipeline</FieldLabel>
							<Select
								value={pipeline}
								onValueChange={(value) => void setPipeline(value)}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="All pipelines" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All pipelines</SelectItem>
									{(pipelines.data ?? []).map((item) => (
										<SelectItem key={item.id} value={item.id}>
											{item.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						{dimension === "dealAttribute" ? (
							<Field>
								<FieldLabel htmlFor="analytics-attribute">
									Deal field key
								</FieldLabel>
								<Input
									id="analytics-attribute"
									value={attribute}
									onChange={(event) => void setAttribute(event.target.value)}
									placeholder="e.g. segment"
								/>
							</Field>
						) : (
							<div className="flex items-end">
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										void setView("conversionFunnel");
										void setDimension("channel");
										void setPipeline("all");
										void setAttribute("");
									}}
								>
									Reset view
								</Button>
							</div>
						)}
					</div>
					{dimension === "dealAttribute" && !attribute.trim() ? (
						<p className="text-muted-foreground text-xs">
							Enter a readable deal field key to load this breakdown.
						</p>
					) : null}
					{analytics.isLoading ? (
						<div className="flex justify-center py-10">
							<Spinner />
						</div>
					) : null}
					{analytics.error ? (
						<p
							role="alert"
							className="border border-destructive/40 p-3 text-destructive text-xs"
						>
							{analytics.error.message}
						</p>
					) : null}
					{selectedView ? <AnalyticsView view={selectedView} /> : null}
				</CardContent>
			</Card>
		</div>
	);
}

function AnalyticsView({
	view,
}: {
	view: import("./studio-analytics-data").AnalyticsView;
}) {
	return (
		<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)]">
			<div className="min-w-0 border p-3">
				<div className="mb-3">
					<p className="font-medium text-sm">{view.title}</p>
					<p className="text-muted-foreground text-xs">{view.description}</p>
				</div>
				<BarTrend
					data={chartRows(view)}
					config={chartConfig(view)}
					xKey="label"
					height={260}
					showXAxis={view.chart.data.labels.length < 12}
					formatValue={formatMetric}
				/>
			</div>
			<div className="border p-3">
				<p className="mb-3 font-medium text-sm">Rows</p>
				<div className="flex max-h-64 flex-col gap-2 overflow-auto">
					{view.rows.length === 0 ? (
						<p className="text-muted-foreground text-xs">
							No records in this window.
						</p>
					) : (
						view.rows.slice(0, 12).map((row) => (
							<div
								key={`${String(row.label ?? "row")}:${String(row.deals ?? row.value ?? "")}`}
								className="flex items-center justify-between gap-3 border-b pb-2 text-xs"
							>
								<span className="min-w-0 truncate">
									{String(row.label ?? "Unlabelled")}
								</span>
								<span className="shrink-0 tabular-nums">
									{String(row.deals ?? row.value ?? "—")}
								</span>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
