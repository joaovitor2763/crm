import type { SearchParams } from "nuqs/server";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { DashboardSummary } from "./dashboard-summary";
import { OverviewGreeting } from "./overview-greeting";
import { OverviewScopeToggle } from "./overview-scope";
import { loadOverviewSearchParams } from "./overview-search-params";

export default async function OverviewPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	await requireSession();

	// Parsed with the same parser the toggle uses, so the first paint is already
	// scoped to whoever the URL says rather than to the default.
	const { scope } = await loadOverviewSearchParams(searchParams);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	// Both awaited: the greeting is one line of text and the dashboard is the
	// whole page, so a skeleton that flashes for the length of one API call is
	// worse than rendering a beat later.
	await Promise.all([
		queryClient.prefetchQuery(trpc.users.me.queryOptions()),
		queryClient.prefetchQuery(trpc.dashboard.summary.queryOptions({ scope })),
		queryClient.prefetchQuery(
			trpc.activities.myTasks.queryOptions({ window: "all", limit: 10 }),
		),
	]);

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<HydrateClient>
						<OverviewGreeting />
					</HydrateClient>
				</PageShellHeading>
				<PageShellActions>
					<OverviewScopeToggle />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent>
				<HydrateClient>
					<DashboardSummary />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
