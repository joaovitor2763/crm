"use client";

import { Button } from "@crm/ui/components/button";
import { CapabilityCard } from "@crm/ui/components/capability-card";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { DashboardSection } from "@crm/ui/components/dashboard";
import { Spinner } from "@crm/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useTRPC } from "@/lib/trpc/client";
import { OverviewScopeToggle } from "../overview-scope";
import { overviewParsers } from "../overview-search-params";
import { SalesDashboard } from "../sales-dashboard";

export function StudioDashboards() {
	const trpc = useTRPC();
	const [scope] = useQueryState("scope", overviewParsers.scope);
	const summary = useQuery(trpc.dashboard.summary.queryOptions({ scope }));

	return (
		<div className="flex flex-col gap-6">
			<DashboardSection
				title="Standard revenue views"
				description="The current dashboard contract provides conversion and pipeline signals at team or personal scope."
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

			<CapabilityCard
				title="Dashboard builder"
				description="Custom breakdowns need a persisted visualization schema."
				status="Capability pending"
				action={
					<Button type="button" variant="outline" size="sm" disabled>
						Add visualization
					</Button>
				}
			>
				The existing summary endpoint already supports standard pipeline and
				cycle-time signals. Custom funnel stages, channel, seller, UTM and deal
				attribute breakdowns will become configurable once the dashboard schema
				is available through tRPC.
			</CapabilityCard>

			<Card>
				<CardHeader>
					<CardTitle>Planned standard views</CardTitle>
					<CardDescription>
						A clear contract for the next dashboard slice.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2 md:grid-cols-2">
					{[
						"Conversion by pipeline and stage",
						"Time between stages",
						"Breakdown by channel and owner",
						"UTM and deal attribute cohorts",
					].map((label) => (
						<div key={label} className="border p-3 text-sm">
							{label}
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
