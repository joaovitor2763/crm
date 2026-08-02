import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { RevenueStudio } from "./revenue-studio";
import { loadStudioSearchParams } from "./studio-search-params";

export const metadata: Metadata = {
	title: "Revenue Architecture Studio",
};

export default async function StudioPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	await requireSession();

	const { scope } = await loadStudioSearchParams(searchParams);
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const capabilities = await queryClient.fetchQuery(
		trpc.governance.capabilities.queryOptions(),
	);
	const can = (resource: string, action: string) =>
		capabilities.isAdmin ||
		capabilities.permissions.some(
			(permission) =>
				permission.resource === resource &&
				permission.action === action &&
				permission.scope !== "NONE",
		);
	const access = {
		pipelines: can("pipelines", "MANAGE"),
		products: can("products", "MANAGE"),
		fields: can("fields", "MANAGE"),
		fieldsRead: can("fields", "READ") || can("fields", "MANAGE"),
		automations: can("automations", "MANAGE"),
	};

	const prefetches: Promise<void>[] = [
		queryClient.prefetchQuery(trpc.dashboard.summary.queryOptions({ scope })),
	];
	if (access.pipelines || access.products || access.automations) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.governance.directory.queryOptions()),
		);
	}
	if (access.pipelines) {
		prefetches.push(
			queryClient.prefetchQuery(
				trpc.pipelines.list.queryOptions({ includeArchived: true }),
			),
		);
	}
	if (access.products) {
		prefetches.push(
			queryClient.prefetchQuery(
				trpc.products.list.queryOptions({ includeArchived: true }),
			),
		);
	}
	if (access.fieldsRead) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.fields.schema.queryOptions({})),
		);
	}
	if (access.automations) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.automations.list.queryOptions()),
			queryClient.prefetchQuery(trpc.automations.webhooks.queryOptions()),
		);
	}
	await Promise.all(prefetches);

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Revenue Architecture Studio</PageShellTitle>
					<PageShellDescription>
						Shape the objects, flows and operating signals behind revenue.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<RevenueStudio access={access} />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
