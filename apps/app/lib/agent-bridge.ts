/**
 * How a signed-in rep reaches the research agent.
 *
 * Server-side only, and structurally so: the secret is read from
 * `AGENT_BRIDGE_SECRET` at call time, and Next only inlines `NEXT_PUBLIC_*`
 * into the browser bundle. Imported from a client component this would find
 * `undefined` and throw rather than ship the secret — which is why the guard is
 * the variable's name rather than a `server-only` import that a test runner
 * resolves differently.
 *
 * The agent is its own deployment on its own origin, and the browser never
 * talks to it. Instead the app proxies `/eve/v1/*` from its own origin
 * (`app/eve/v1/[...path]/route.ts`) and mints a short-lived token naming the
 * person who is signed in.
 *
 * Three problems that solves at once:
 *
 * - **No CORS and no cross-site cookie.** Same trade the app already makes for
 *   the API: a same-origin path means the session cookie just works, and we
 *   never scope an auth cookie to a third host.
 * - **The agent learns *who* is asking**, not merely that the app is asking. A
 *   shared service credential would make every rep look like the deployment,
 *   and `lib/approval.ts` on the other side decides what to do based on whether
 *   a person is present.
 * - **The blast radius is a minute.** The agent can read every email in the
 *   CRM; a long-lived token in a browser tab is not a thing to hand out.
 *
 * HS256 rather than something asymmetric because both halves are ours and
 * deploy together. `AGENT_BRIDGE_SECRET` is the only new configuration, and it
 * is required on both sides for the panel to work at all.
 */

/** Must match `apps/agent/agent/channels/eve.ts`. */
const ISSUER = "crm-app";
const AUDIENCE = "crm-agent";

/** Long enough for a slow request, short enough not to be worth stealing. */
const TTL_SECONDS = 120;

/**
 * `127.0.0.1`, not `localhost`.
 *
 * `eve dev` binds IPv4 only, while Node's resolver hands `localhost` back as
 * `::1` first — so a default of `http://localhost:2000` fails to connect on a
 * machine where the agent is plainly running, and reports itself as "the agent
 * is not reachable". Naming the address avoids the resolution entirely.
 */
export const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:2000";

export function bridgeConfigured(): boolean {
	return Boolean(process.env.AGENT_BRIDGE_SECRET);
}

/**
 * Record ids are opaque database keys, not necessarily Prisma-generated cuids.
 *
 * Seeded and imported records may deliberately use stable ids such as
 * `seed-deal-fernhill-1`. Treating the storage format as a cuid silently
 * stripped those ids at the proxy, so the Agent session started with no record
 * in focus. Keep the boundary narrow without guessing which valid id strategy
 * the database used.
 */
export function bridgeRecordId(value: string | null): string | undefined {
	const id = value?.trim();
	return id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : undefined;
}

/**
 * A bearer token for one rep, valid for two minutes.
 *
 * Hand-rolled rather than pulling in a JWT library: this signs one fixed claim
 * set with one algorithm, and `crypto.subtle` does HMAC. A dependency here
 * would be more surface than code.
 */
export async function mintBridgeToken(
	user: {
		id: string;
		email: string;
		name: string;
	},
	/**
	 * The record the rep has open.
	 *
	 * Carried in the token rather than pasted into the message, because the
	 * agent already knows how to read it from there: `instructions/task.ts`
	 * resolves `attributes.contactId` at `session.started`, which is the same
	 * path the dispatcher uses. The alternative — prefixing every message with
	 * "About contact <cuid> (Name):" — put plumbing in front of a person and
	 * made their own question unreadable.
	 */
	record: { contactId?: string; companyId?: string; dealId?: string } = {},
): Promise<string> {
	const secret = process.env.AGENT_BRIDGE_SECRET;
	if (!secret) throw new Error("AGENT_BRIDGE_SECRET is not set.");

	const now = Math.floor(Date.now() / 1000);

	const header = { alg: "HS256", typ: "JWT" };
	const payload = {
		iss: ISSUER,
		aud: AUDIENCE,
		sub: user.id,
		email: user.email,
		name: user.name,
		...(record.contactId ? { contactId: record.contactId } : {}),
		...(record.companyId ? { companyId: record.companyId } : {}),
		...(record.dealId ? { dealId: record.dealId } : {}),
		iat: now,
		// `nbf` a little in the past: the agent allows clock skew, but there is no
		// reason to hand it a token that is not valid yet.
		nbf: now - 5,
		exp: now + TTL_SECONDS,
	};

	const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
		JSON.stringify(payload),
	)}`;

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(signingInput),
	);

	return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

function base64url(input: string | Uint8Array): string {
	const bytes =
		typeof input === "string" ? new TextEncoder().encode(input) : input;
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
