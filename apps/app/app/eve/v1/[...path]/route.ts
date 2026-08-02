import {
	AGENT_URL,
	bridgeConfigured,
	bridgeRecordId,
	mintBridgeToken,
} from "@/lib/agent-bridge";
import { getSession } from "@/lib/session";

/**
 * Same-origin passthrough to the research agent.
 *
 * Mounted at `/eve/v1/*` on purpose: that is where `useEveAgent()` looks by
 * default, so the panel needs no host configuration and the browser never
 * discovers that the agent is a separate deployment.
 *
 * Unlike the API proxy beside it, this one is an **enforcement point** rather
 * than a passthrough. The agent never sees the session cookie — it gets a
 * two-minute token minted here — so if this route did not check the session,
 * nothing downstream would. Every request is authenticated before it is
 * forwarded, and an unauthenticated one is refused rather than passed on.
 */

/** Streaming, and per-request session reads. Never cache any of it. */
export const dynamic = "force-dynamic";

async function handler(request: Request): Promise<Response> {
	if (!bridgeConfigured()) {
		return Response.json(
			{ error: "The research agent is not configured for this install." },
			{ status: 503 },
		);
	}

	const session = await getSession();
	if (!session) {
		return Response.json({ error: "Not signed in." }, { status: 401 });
	}

	const url = new URL(request.url);
	const target = `${AGENT_URL}${url.pathname}${url.search}`;

	const headers = new Headers(request.headers);

	// Hop-by-hop and origin-describing headers belong to the browser→app hop,
	// not this one. `cookie` goes too: the agent has no use for a session it
	// cannot read, and forwarding credentials to a service that does not need
	// them is how they end up in somebody's log.
	for (const header of [
		"host",
		"cookie",
		"x-forwarded-host",
		"x-forwarded-proto",
		"x-forwarded-for",
		"forwarded",
		"transfer-encoding",
		"connection",
		"keep-alive",
		"content-length",
		"expect",
	]) {
		headers.delete(header);
	}

	// Which record the rep has open, if any. Taken from a header the panel sets
	// and put into the token, so the agent gets it through the same
	// `session.auth` path the dispatcher uses — and the rep's own message stays
	// their own words. Not trusted for anything but focus: it decides what the
	// agent looks at, never what it may do.
	const contactId = request.headers.get("x-crm-contact");
	const companyId = request.headers.get("x-crm-company");
	const dealId = request.headers.get("x-crm-deal");
	headers.delete("x-crm-contact");
	headers.delete("x-crm-company");
	headers.delete("x-crm-deal");

	headers.set(
		"authorization",
		`Bearer ${await mintBridgeToken(
			{
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
			},
			{
				contactId: bridgeRecordId(contactId),
				companyId: bridgeRecordId(companyId),
				dealId: bridgeRecordId(dealId),
			},
		)}`,
	);

	const init: RequestInit & { duplex?: "half" } = {
		method: request.method,
		headers,
		redirect: "manual",
		// The event stream is long-lived and the client aborts it on unmount;
		// without this the upstream request outlives the reader.
		signal: request.signal,
	};

	if (request.method !== "GET" && request.method !== "HEAD") {
		init.body = request.body;
		init.duplex = "half";
	}

	let upstream: Response;
	try {
		upstream = await fetch(target, init);
	} catch (error) {
		// The agent being down is an ordinary condition for the rest of the CRM,
		// so it reads as one rather than a 500 with a stack trace in it.
		return Response.json(
			{
				error: "The research agent is not reachable.",
				detail: error instanceof Error ? error.message : String(error),
			},
			{ status: 502 },
		);
	}

	const responseHeaders = new Headers(upstream.headers);
	for (const header of [
		"transfer-encoding",
		"connection",
		"content-encoding",
		"content-length",
	]) {
		responseHeaders.delete(header);
	}

	// The whole point of this route is the NDJSON event stream, so the body is
	// piped rather than buffered — reading it to completion first would deliver
	// the agent's reasoning in one lump after the run had already finished.
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: responseHeaders,
	});
}

export {
	handler as DELETE,
	handler as GET,
	handler as HEAD,
	handler as OPTIONS,
	handler as PATCH,
	handler as POST,
	handler as PUT,
};
