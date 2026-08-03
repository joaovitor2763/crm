import type { Metadata } from "next";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { getCapabilities } from "@/lib/capabilities";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { AutomationsSettings } from "../settings/automations-settings";

export const metadata: Metadata = { title: "Automations" };

export default async function AutomationsPage() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const capabilities = await getCapabilities();
	const can = (resource: string) =>
		capabilities.isAdmin ||
		capabilities.permissions.some(
			(permission) =>
				permission.resource === resource &&
				permission.action === "MANAGE" &&
				permission.scope !== "NONE",
		);
	const canManageAutomations = can("automations");
	const canManageWebhooks = can("webhooks");
	if (canManageAutomations || canManageWebhooks) {
		const prefetches = [
			queryClient.prefetchQuery(trpc.governance.directory.queryOptions()),
			queryClient.prefetchQuery(trpc.automations.eventCatalog.queryOptions()),
		];
		if (canManageAutomations) {
			prefetches.push(
				queryClient.prefetchQuery(trpc.automations.list.queryOptions()),
				queryClient.prefetchQuery(
					trpc.pipelines.list.queryOptions({ includeArchived: false }),
				),
			);
		}
		if (canManageWebhooks) {
			prefetches.push(
				queryClient.prefetchQuery(trpc.automations.webhooks.queryOptions()),
			);
		}
		await Promise.all(prefetches);
	}

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Automations</PageShellTitle>
					<PageShellDescription>
						Create and monitor event-driven rules and outbound webhooks.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				{canManageAutomations || canManageWebhooks ? (
					<HydrateClient>
						<AutomationsSettings
							canManageAutomations={canManageAutomations}
							canManageWebhooks={canManageWebhooks}
						/>
					</HydrateClient>
				) : (
					<div className="border border-dashed p-6 text-muted-foreground text-sm">
						You need governed automation management access to use this page.
					</div>
				)}
			</PageShellContent>
		</PageShell>
	);
}
