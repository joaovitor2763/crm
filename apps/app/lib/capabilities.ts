import "server-only";
import { cookies } from "next/headers";
import type { RouterOutputs } from "@/lib/trpc/types";
import { getServerQueryClient, getServerTrpc } from "./trpc/server";

type Capabilities = RouterOutputs["governance"]["capabilities"];

/**
 * Capabilities, without paying an API round trip on every navigation.
 *
 * Every gated page used to block its render on a governance.capabilities
 * fetch before it could even start prefetching data — a full serverless hop
 * per screen for an answer that changes when an admin edits a role, which is
 * to say almost never. A short per-instance cache keyed by session token
 * absorbs that hop for a minute at a time.
 *
 * This only gates what the UI *shows*; the API re-checks permissions on every
 * actual read and write, so a stale minute here can at worst render a nav
 * entry the first click would refuse.
 */
const TTL_MS = 60_000;
const cacheByToken = new Map<string, { at: number; value: Capabilities }>();

export async function getCapabilities(): Promise<Capabilities> {
	const token = (await cookies()).get("better-auth.session_token")?.value ?? "";
	const cached = token ? cacheByToken.get(token) : undefined;
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const options = trpc.governance.capabilities.queryOptions();

	if (cached && Date.now() - cached.at < TTL_MS) {
		// Seed the request's query client so the dehydrated payload still
		// carries capabilities for any client component that asks.
		queryClient.setQueryData(options.queryKey, cached.value);
		return cached.value;
	}

	const value = (await queryClient.fetchQuery(options)) as Capabilities;
	if (token) {
		if (cacheByToken.size > 500) cacheByToken.clear();
		cacheByToken.set(token, { at: Date.now(), value });
	}
	return value;
}
