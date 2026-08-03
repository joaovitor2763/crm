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
import { DashboardWorkspaces } from "./dashboard-workspaces";

export const metadata: Metadata = { title: "Dashboards" };

export default async function DashboardsPage() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const capabilities = await queryClient.fetchQuery(
		trpc.governance.capabilities.queryOptions(),
	);
	const canRead =
		capabilities.isAdmin ||
		capabilities.permissions.some(
			(permission) =>
				permission.resource === "dashboards" &&
				["READ", "MANAGE"].includes(permission.action) &&
				permission.scope !== "NONE",
		);
	if (canRead) {
		await Promise.all([
			queryClient.prefetchQuery(
				trpc.dashboard.workspacesList.queryOptions({
					scope: "all",
					q: "",
					page: 1,
					pageSize: 24,
				}),
			),
			queryClient.prefetchQuery(
				trpc.dashboard.definitionTemplates.queryOptions(),
			),
		]);
	}

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Dashboards</PageShellTitle>
					<PageShellDescription>
						Reusable revenue views for you and the wider team.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				{canRead ? (
					<HydrateClient>
						<DashboardWorkspaces />
					</HydrateClient>
				) : (
					<div className="border border-dashed p-6 text-muted-foreground text-sm">
						You need governed dashboard access to use this page.
					</div>
				)}
			</PageShellContent>
		</PageShell>
	);
}
