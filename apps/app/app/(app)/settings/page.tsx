import type { Metadata } from "next";
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
import { ArchivedRecordsSettings } from "./archived-records-settings";
import {
	AutomationsSettings,
	ExternalAccessSettings,
} from "./automations-settings";
import { FieldsSettings } from "./fields-settings";
import { GoogleConnection } from "./google-connection";
import { GovernanceSettings } from "./governance-settings";
import { MarketingSettings } from "./marketing-settings";
import { PipelinesSettings } from "./pipelines-settings";
import { ProductsSettings } from "./products-settings";

export const metadata: Metadata = {
	title: "Settings",
};

export default async function SettingsPage() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	// Awaited: the whole page is this one query, and rendering "Not connected"
	// for a beat before flipping to "Connected" is worse than waiting for it.
	await queryClient.prefetchQuery(trpc.google.status.queryOptions());
	const capabilities = await queryClient.fetchQuery(
		trpc.governance.capabilities.queryOptions(),
	);
	const prefetches: Promise<void>[] = [];
	const can = (resource: string, action: string) =>
		capabilities.isAdmin ||
		capabilities.permissions.some(
			(permission) =>
				permission.resource === resource &&
				permission.action === action &&
				permission.scope !== "NONE",
		);
	const canManage = (resource: string) => can(resource, "MANAGE");
	if (
		canManage("business-units") ||
		canManage("teams") ||
		canManage("roles") ||
		canManage("users")
	) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.governance.overview.queryOptions()),
		);
	}
	if (canManage("fields")) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.fields.schema.queryOptions({})),
		);
	}
	if (canManage("automations")) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.automations.list.queryOptions()),
		);
	}
	if (canManage("webhooks")) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.automations.webhooks.queryOptions()),
		);
	}
	if (canManage("api-credentials")) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.apiCredentials.list.queryOptions()),
		);
	}
	if (
		canManage("automations") ||
		canManage("webhooks") ||
		canManage("api-credentials")
	) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.governance.directory.queryOptions()),
		);
	}
	if (canManage("pipelines")) {
		prefetches.push(
			queryClient.prefetchQuery(
				trpc.pipelines.list.queryOptions({ includeArchived: true }),
			),
		);
	}
	if (canManage("products")) {
		prefetches.push(
			queryClient.prefetchQuery(
				trpc.products.list.queryOptions({ includeArchived: true }),
			),
		);
	}
	if (canManage("marketing-forms") && canManage("marketing-events")) {
		prefetches.push(
			queryClient.prefetchQuery(
				trpc.marketing.forms.queryOptions({ includeArchived: true }),
			),
		);
		prefetches.push(
			queryClient.prefetchQuery(
				trpc.marketing.events.queryOptions({ includeArchived: true }),
			),
		);
	}
	const canManageArchive =
		can("companies", "READ") &&
		can("companies", "RESTORE") &&
		can("contacts", "READ") &&
		can("contacts", "RESTORE") &&
		can("deals", "READ") &&
		can("deals", "RESTORE");
	if (canManageArchive) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.companies.archived.queryOptions()),
			queryClient.prefetchQuery(trpc.contacts.archived.queryOptions()),
			queryClient.prefetchQuery(trpc.deals.archived.queryOptions()),
		);
	}
	await Promise.all(prefetches);

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Settings</PageShellTitle>
					<PageShellDescription>
						Your meetings and email, on the companies they belong to.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<HydrateClient>
					<GoogleConnection />
					{canManage("business-units") ? <GovernanceSettings /> : null}
					{canManage("fields") ? <FieldsSettings /> : null}
					{canManage("automations") ? <AutomationsSettings /> : null}
					{canManage("api-credentials") && capabilities.isAdmin ? (
						<ExternalAccessSettings />
					) : null}
					{canManage("pipelines") ? <PipelinesSettings /> : null}
					{canManage("products") ? <ProductsSettings /> : null}
					{canManage("marketing-forms") && canManage("marketing-events") ? (
						<MarketingSettings />
					) : null}
					{canManageArchive ? <ArchivedRecordsSettings /> : null}
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
