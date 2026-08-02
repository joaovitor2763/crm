import { Button } from "@crm/ui/components/button";
import { CapabilityCard } from "@crm/ui/components/capability-card";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { DashboardGrid, KpiCard } from "@crm/ui/components/dashboard";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { formatCount, formatMoneyCompact } from "@crm/ui/lib/format";
import type { RouterOutputs } from "@/lib/trpc/types";
import type { StudioView } from "./studio-search-params";

type Summary = RouterOutputs["dashboard"]["summary"];
type Pipeline = RouterOutputs["pipelines"]["list"][number];
type Product = RouterOutputs["products"]["list"][number];
type Schema = RouterOutputs["fields"]["schema"];

export function StudioOverview({
	summary,
	pipelines,
	products,
	schema,
	onNavigate,
}: {
	summary?: Summary;
	pipelines?: Pipeline[];
	products?: Product[];
	schema?: Schema;
	onNavigate: (view: StudioView) => void;
}) {
	const relationCount =
		schema?.reduce(
			(count, object) => count + object.sourceRelations.length,
			0,
		) ?? 0;

	return (
		<div className="flex flex-col gap-6">
			<DashboardGrid columns={4}>
				<KpiCard title="Pipelines">
					<p className="font-medium text-3xl tracking-tight tabular-nums">
						{pipelines?.length ?? "—"}
					</p>
					<p className="text-muted-foreground text-xs">
						{pipelines ? "Including archived" : "Requires pipeline read access"}
					</p>
				</KpiCard>
				<KpiCard title="Products">
					<p className="font-medium text-3xl tracking-tight tabular-nums">
						{products?.length ?? "—"}
					</p>
					<p className="text-muted-foreground text-xs">
						{products
							? "Catalogue definitions"
							: "Requires product read access"}
					</p>
				</KpiCard>
				<KpiCard title="Objects and relations">
					<p className="font-medium text-3xl tracking-tight tabular-nums">
						{schema ? `${schema.length}/${relationCount}` : "—"}
					</p>
					<p className="text-muted-foreground text-xs">Objects / definitions</p>
				</KpiCard>
				<KpiCard title="Open pipeline">
					<p className="font-medium text-3xl tracking-tight tabular-nums">
						{summary ? formatMoneyCompact(summary.pipeline.totalCents) : "—"}
					</p>
					<p className="text-muted-foreground text-xs">
						{summary
							? formatCount(summary.pipeline.totalDeals, "open deal")
							: "Loading dashboard summary"}
					</p>
				</KpiCard>
			</DashboardGrid>

			<Card>
				<CardHeader>
					<CardTitle>Revenue architecture map</CardTitle>
					<CardDescription>
						A governed path from definition to operating workflow.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-0 border">
					<MapRow
						label="Define"
						description="Objects, fields, relations and pipeline stages"
						status={schema ? "Connected" : "Read access required"}
						onClick={() => onNavigate("fields")}
					/>
					<MapRow
						label="Operate"
						description="Pipelines, products and governed automations"
						status={
							pipelines && products ? "Connected" : "Read access required"
						}
						onClick={() => onNavigate("pipelines")}
					/>
					<MapRow
						label="Measure"
						description="Conversion, cycle time and stage performance"
						status={summary ? "Connected" : "Loading"}
						onClick={() => onNavigate("dashboards")}
					/>
				</CardContent>
			</Card>

			<CapabilityCard
				title="AI-first governance"
				description="The Studio keeps definitions legible to humans and agents."
				status="Available"
				action={
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onNavigate("automations")}
					>
						Review automations
					</Button>
				}
			>
				Use this surface to keep the business vocabulary, ownership boundaries
				and operating rules together. Changes still use the existing governed
				mutations behind each settings view.
			</CapabilityCard>
		</div>
	);
}

function MapRow({
	label,
	description,
	status,
	onClick,
}: {
	label: string;
	description: string;
	status: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="grid gap-1 border-b p-4 text-left last:border-b-0 hover:bg-muted/50 md:grid-cols-[8rem_minmax(0,1fr)_auto] md:items-center md:gap-4"
			onClick={onClick}
		>
			<span className="font-medium text-sm">{label}</span>
			<span className="text-muted-foreground text-sm">{description}</span>
			<StatusIndicator
				tone={status === "Connected" ? "success" : "neutral"}
				label={status}
			/>
		</button>
	);
}
