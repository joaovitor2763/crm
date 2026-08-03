import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { CreateDealSheet } from "./create-deal-sheet";
import {
	dealsSearchParams,
	loadDealsViewSearchParams,
} from "./deals-search-params";
import { DealsView } from "./deals-view";

export const metadata: Metadata = {
	title: "Deals",
};

export default async function DealsPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	await requireSession();

	const [values, viewValues] = await Promise.all([
		dealsSearchParams.load(searchParams),
		loadDealsViewSearchParams(searchParams),
	]);
	const input = dealsSearchParams.toInput(values);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	// The rows are awaited so the first paint is the filtered, sorted, correct
	// page rather than a spinner. The owner and company pickers behind the facet
	// dropdowns are not — the table draws fine without them.
	await queryClient.prefetchQuery(trpc.deals.list.queryOptions(input));
	if (viewValues.view === "kanban") {
		await queryClient.prefetchQuery(
			trpc.deals.board.queryOptions({
				q: input.q,
				owner: input.owner,
				pipeline: input.pipeline,
				closing: input.closing,
			}),
		);
	}
	void queryClient.prefetchQuery(trpc.users.list.queryOptions());
	void queryClient.prefetchQuery(
		trpc.companies.options.queryOptions({ q: "" }),
	);
	void queryClient.prefetchQuery(
		trpc.pipelines.list.queryOptions({ includeArchived: false }),
	);

	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Deals</PageShellTitle>
					<PageShellDescription>
						The pipeline, and everything that has already closed.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateDealSheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<HydrateClient>
					<DealsView />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
