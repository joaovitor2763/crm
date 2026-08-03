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
import { UserManagement } from "../settings/governance-settings";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
	await requireSession();
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(trpc.governance.overview.queryOptions()),
		queryClient.prefetchQuery(trpc.governance.capabilities.queryOptions()),
	]);
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Users</PageShellTitle>
					<PageShellDescription>
						Add users, manage passwords, roles, status and the teams each person
						can work in.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<HydrateClient>
					<UserManagement />
				</HydrateClient>
			</PageShellContent>
		</PageShell>
	);
}
