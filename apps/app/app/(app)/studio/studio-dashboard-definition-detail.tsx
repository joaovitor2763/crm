"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Spinner } from "@crm/ui/components/spinner";
import { BarTrend } from "@/components/dashboard-charts";
import { chartConfig, chartRows, formatMetric } from "./studio-analytics-data";
import type {
	DashboardDefinition,
	DashboardRendered,
} from "./studio-dashboard-definition-data";

export function DashboardDefinitionDetail({
	definition,
	rendered,
	canManage,
	busy,
	onEdit,
	onDuplicate,
	onVersion,
	onPublish,
	onArchive,
}: {
	definition: DashboardDefinition;
	rendered: DashboardRendered | undefined;
	canManage: boolean;
	busy: boolean;
	onEdit: () => void;
	onDuplicate: () => void;
	onVersion: () => void;
	onPublish: () => void;
	onArchive: () => void;
}) {
	const view = rendered?.view;
	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>{definition.name}</CardTitle>
						<CardDescription>
							{definition.key} · version {definition.version} ·{" "}
							{definition.status}
						</CardDescription>
					</div>
					<div className="flex flex-wrap gap-2">
						{canManage && definition.status === "DRAFT" ? (
							<>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={onEdit}
								>
									Edit
								</Button>
								<Button
									type="button"
									size="sm"
									disabled={busy}
									onClick={onPublish}
								>
									Publish
								</Button>
							</>
						) : null}
						{canManage ? (
							<>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={busy}
									onClick={onDuplicate}
								>
									Duplicate
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={busy}
									onClick={onVersion}
								>
									New version
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={onArchive}
								>
									Archive
								</Button>
							</>
						) : null}
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{rendered?.comparisonSupport.supported === false ? (
					<p className="border border-destructive/40 p-3 text-destructive text-xs">
						Comparison metadata:{" "}
						{rendered.comparisonSupport.reason ?? "Unsupported"}
					</p>
				) : null}
				{view ? (
					<div className="border p-3">
						<p className="mb-3 font-medium text-sm">Rendered view</p>
						<BarTrend
							data={chartRows(view)}
							config={chartConfig(view)}
							xKey="label"
							height={260}
							showXAxis={view.chart.data.labels.length < 12}
							formatValue={formatMetric}
						/>
					</div>
				) : (
					<div className="flex justify-center border py-10">
						<Spinner />
					</div>
				)}
			</CardContent>
		</Card>
	);
}
