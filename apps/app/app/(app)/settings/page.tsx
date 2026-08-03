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
import { AiSettings } from "./ai-settings";
import { ArchivedRecordsSettings } from "./archived-records-settings";
import { ExternalAccessSettings } from "./automations-settings";
import { GoogleConnection } from "./google-connection";
import { GovernanceSettings, UserManagement } from "./governance-settings";
import { MarketingSettings } from "./marketing-settings";
import { SettingsSections } from "./settings-sections";
import { WorkspaceSettings } from "./workspace-settings";

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
	const capabilities = await getCapabilities();
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
			queryClient.prefetchQuery(trpc.automations.eventCatalog.queryOptions()),
		);
	}
	if (capabilities.isAdmin) {
		prefetches.push(
			queryClient.prefetchQuery(trpc.governance.capabilities.queryOptions()),
			queryClient.prefetchQuery(
				trpc.governance.workspaceConfiguration.queryOptions(),
			),
			queryClient.prefetchQuery(trpc.agentAdmin.configuration.queryOptions()),
			queryClient.prefetchQuery(
				trpc.agentAdmin.tasks.queryOptions({
					status: "all",
					q: "",
					page: 1,
					pageSize: 25,
				}),
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
						Manage connections, governance, AI and workspace access.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<HydrateClient>
					<SettingsSections
						sections={[
							...(capabilities.isAdmin
								? [
										{
											id: "workspace",
											label: "Workspace",
											description:
												"Default currency and installation-wide preferences.",
											content: <WorkspaceSettings />,
										},
									]
								: []),
							{
								id: "connections",
								label: "Connections",
								description: "Your calendar and mailbox connection.",
								content: <GoogleConnection />,
							},
							...(canManage("business-units")
								? [
										{
											id: "governance",
											label: "Governance",
											description:
												"People, roles, teams and business-unit boundaries.",
											content: <GovernanceSettings />,
										},
									]
								: []),
							...(capabilities.isAdmin
								? [
										{
											id: "admins",
											label: "Admins",
											description:
												"Add users and manage their passwords, roles and access.",
											content: <UserManagement />,
										},
										{
											id: "ai",
											label: "AI & tasks",
											description:
												"Provider credentials, model routing and the internal agent queue.",
											content: <AiSettings />,
										},
									]
								: []),
							...(canManage("api-credentials") && capabilities.isAdmin
								? [
										{
											id: "access",
											label: "External access",
											description:
												"API credentials and governed integration access.",
											content: <ExternalAccessSettings />,
										},
									]
								: []),
							...(canManage("marketing-forms") && canManage("marketing-events")
								? [
										{
											id: "marketing",
											label: "Marketing",
											description:
												"Forms and events used in conversion journeys.",
											content: <MarketingSettings />,
										},
									]
								: []),
							...(canManageArchive
								? [
										{
											id: "archive",
											label: "Archive",
											description: "Review and restore archived CRM records.",
											content: <ArchivedRecordsSettings />,
										},
									]
								: []),
						]}
					/>
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
