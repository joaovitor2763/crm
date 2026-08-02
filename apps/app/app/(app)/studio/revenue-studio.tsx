"use client";

import Archive from "@carbon/icons-react/es/Archive";
import Building from "@carbon/icons-react/es/Building";
import Column from "@carbon/icons-react/es/Column";
import Dashboard from "@carbon/icons-react/es/Dashboard";
import MagicWand from "@carbon/icons-react/es/MagicWand";
import Partnership from "@carbon/icons-react/es/Partnership";
import Settings from "@carbon/icons-react/es/Settings";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { StudioNavigation } from "@crm/ui/components/studio-navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useTRPC } from "@/lib/trpc/client";
import { AutomationsSettings } from "../settings/automations-settings";
import { FieldsSettings } from "../settings/fields-settings";
import { PipelinesSettings } from "../settings/pipelines-settings";
import { ProductsSettings } from "../settings/products-settings";
import { StudioAccounts, StudioLineage } from "./studio-capabilities";
import { StudioDashboards } from "./studio-dashboards";
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
		id: "automations",
		label: "Automations",
		description: "Rules and webhooks",
		icon: <Icon icon={MagicWand} />,
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
		id: "dashboards",
		label: "Dashboards",
		description: "Standard and builder",
		icon: <Icon icon={Dashboard} />,
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

	return (
		<div className="grid min-h-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
			<aside className="flex flex-col gap-4 border p-3 lg:sticky lg:top-0 lg:self-start">
				<div className="flex items-start justify-between gap-3 border-b pb-3">
					<div>
						<p className="font-medium text-sm">Studio</p>
						<p className="text-muted-foreground text-xs">
							Revenue architecture
						</p>
					</div>
					<Button asChild variant="ghost" size="icon-xs">
						<Link href="/settings" aria-label="Open settings">
							<Icon icon={Settings} />
						</Link>
					</Button>
				</div>
				<StudioNavigation
					items={[...NAV_ITEMS]}
					value={view}
					onValueChange={selectView}
				/>
			</aside>

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
				{view === "relations" ? <StudioRelations schema={schema.data} /> : null}
				{view === "automations" ? (
					access.automations ? (
						<AutomationsSettings />
					) : (
						<AccessRequired label="automations" />
					)
				) : null}
				{view === "accounts" ? <StudioAccounts /> : null}
				{view === "lineage" ? <StudioLineage /> : null}
				{view === "dashboards" ? <StudioDashboards /> : null}
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
