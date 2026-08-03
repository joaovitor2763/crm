"use client";

import Archive from "@carbon/icons-react/es/Archive";
import Building from "@carbon/icons-react/es/Building";
import Column from "@carbon/icons-react/es/Column";
import Dashboard from "@carbon/icons-react/es/Dashboard";
import Partnership from "@carbon/icons-react/es/Partnership";
import Settings from "@carbon/icons-react/es/Settings";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useTRPC } from "@/lib/trpc/client";
import { AutomationsSettings } from "../settings/automations-settings";
import { FieldsSettings } from "../settings/fields-settings";
import { PipelinesSettings } from "../settings/pipelines-settings";
import { ProductsSettings } from "../settings/products-settings";
import { StudioAttribution } from "./studio-attribution";
import { StudioAccounts, StudioLineage } from "./studio-capabilities";
import { StudioDashboards } from "./studio-dashboards";
import { StudioOntology } from "./studio-ontology";
import { StudioOverview } from "./studio-overview";
import { StudioRelations } from "./studio-relations";
import {
	STUDIO_VIEWS,
	type StudioView,
	studioParsers,
} from "./studio-search-params";

type StudioAccess = {
	pipelines: boolean;
	products: boolean;
	fields: boolean;
	fieldsRead: boolean;
	automations: boolean;
	revenueAccountsRead: boolean;
	revenueAccountsWrite: boolean;
	revenueAccountsConfigure: boolean;
	dashboardsRead: boolean;
	dashboardsManage: boolean;
	ontologyManage: boolean;
};

const NAV_ITEMS = [
	{
		id: "overview",
		label: "Overview",
		description: "Impact map",
		icon: <Icon icon={Dashboard} />,
	},
	{
		id: "pipelines",
		label: "Pipelines",
		description: "Stages and flow",
		icon: <Icon icon={Partnership} />,
	},
	{
		id: "catalog",
		label: "Products",
		description: "Commercial catalogue",
		icon: <Icon icon={Column} />,
	},
	{
		id: "fields",
		label: "Objects and fields",
		description: "Business vocabulary",
		icon: <Icon icon={Settings} />,
	},
	{
		id: "relations",
		label: "Relations",
		description: "Ontology links",
		icon: <Icon icon={Partnership} />,
	},
	{
		id: "accounts",
		label: "Accounts",
		description: "Aggregation model",
		icon: <Icon icon={Building} />,
	},
	{
		id: "lineage",
		label: "Lineage and merge",
		description: "History and safety",
		icon: <Icon icon={Archive} />,
	},
	{
		id: "ontology",
		label: "Ontology versions",
		description: "Schema journal",
		icon: <Icon icon={Settings} />,
	},
	{
		id: "attribution",
		label: "Attribution",
		description: "Conversion lineage",
		icon: <Icon icon={Archive} />,
	},
] as const;

export function RevenueStudio({ access }: { access: StudioAccess }) {
	const trpc = useTRPC();
	const [view, setView] = useQueryState("view", studioParsers.view);
	const pipelines = useQuery({
		...trpc.pipelines.list.queryOptions({ includeArchived: true }),
		enabled: access.pipelines,
	});
	const products = useQuery({
		...trpc.products.list.queryOptions({ includeArchived: true }),
		enabled: access.products,
	});
	const schema = useQuery({
		...trpc.fields.schema.queryOptions({}),
		enabled: access.fieldsRead,
	});
	const dashboard = useQuery(
		trpc.dashboard.summary.queryOptions({ scope: "everyone" }),
	);

	const selectView = (next: string) => {
		if ((STUDIO_VIEWS as readonly string[]).includes(next)) {
			void setView(next as StudioView);
		}
	};
	const selectedTool = NAV_ITEMS.find((item) => item.id === view);

	return (
		<div className="flex min-h-0 flex-col gap-5">
			{view !== "overview" ? (
				<div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
					<div className="flex min-w-0 items-center gap-3">
						<Button asChild variant="outline" size="sm">
							<Link href="/studio">← Studio</Link>
						</Button>
						<div className="min-w-0">
							<p className="truncate font-medium text-sm">
								{selectedTool?.label ?? "Studio tool"}
							</p>
							<p className="truncate text-muted-foreground text-xs">
								{selectedTool?.description}
							</p>
						</div>
					</div>
					<Button asChild variant="ghost" size="sm">
						<Link href="/settings">
							<Icon icon={Settings} /> Settings
						</Link>
					</Button>
				</div>
			) : null}

			<section className="min-w-0">
				{view === "overview" ? (
					<StudioOverview
						summary={dashboard.data}
						pipelines={pipelines.data}
						products={products.data}
						schema={schema.data}
						onNavigate={selectView}
					/>
				) : null}
				{view === "pipelines" ? (
					access.pipelines ? (
						<PipelinesSettings />
					) : (
						<AccessRequired label="pipelines" />
					)
				) : null}
				{view === "catalog" ? (
					access.products ? (
						<ProductsSettings />
					) : (
						<AccessRequired label="products" />
					)
				) : null}
				{view === "fields" ? (
					access.fields ? (
						<FieldsSettings />
					) : (
						<AccessRequired label="fields" />
					)
				) : null}
				{view === "relations" ? (
					<StudioRelations schema={schema.data} canManage={access.fields} />
				) : null}
				{view === "automations" ? (
					access.automations ? (
						<AutomationsSettings />
					) : (
						<AccessRequired label="automations" />
					)
				) : null}
				{view === "accounts" ? (
					access.revenueAccountsRead ? (
						<StudioAccounts
							canManage={access.revenueAccountsWrite}
							canConfigure={access.revenueAccountsConfigure}
						/>
					) : (
						<AccessRequired label="revenue accounts" />
					)
				) : null}
				{view === "lineage" ? (
					access.revenueAccountsRead ? (
						<StudioLineage
							canManage={access.revenueAccountsWrite}
							canConfigure={access.revenueAccountsConfigure}
						/>
					) : (
						<AccessRequired label="revenue accounts" />
					)
				) : null}
				{view === "dashboards" ? (
					access.dashboardsRead ? (
						<StudioDashboards canManage={access.dashboardsManage} />
					) : (
						<AccessRequired label="dashboards" />
					)
				) : null}
				{view === "ontology" ? (
					access.ontologyManage ? (
						<StudioOntology canManage={access.ontologyManage} />
					) : (
						<AccessRequired label="ontology versions" />
					)
				) : null}
				{view === "attribution" ? <StudioAttribution /> : null}
			</section>
		</div>
	);
}

function AccessRequired({ label }: { label: string }) {
	return (
		<div className="border border-dashed p-6 text-muted-foreground text-sm">
			You need governed {label} access to manage this part of the Studio.
		</div>
	);
}
