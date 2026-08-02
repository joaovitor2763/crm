import { beforeAll, describe, expect, it } from "bun:test";
import { verifyJwtHmac } from "eve/channels/auth";

/**
 * The token the contact sheet uses to reach the agent.
 *
 * This is the security boundary of the whole panel: the agent can read every
 * email in the CRM, and this token is what says a particular signed-in rep is
 * asking. So the test is a real round trip — minted by the app, verified by
 * eve's own verifier with the same configuration `agent/channels/eve.ts`
 * uses — rather than an assertion about what I believe the format to be.
 */

const SECRET = "test-secret-at-least-long-enough-to-be-a-secret";

/** Must match `apps/agent/agent/channels/eve.ts`. */
const CONFIG = {
	algorithm: "HS256",
	audiences: ["crm-agent"],
	issuer: "crm-app",
	secret: SECRET,
} as const;

let bridgeRecordId: typeof import("../lib/agent-bridge").bridgeRecordId;
let mintBridgeToken: typeof import("../lib/agent-bridge").mintBridgeToken;

beforeAll(async () => {
	process.env.AGENT_BRIDGE_SECRET = SECRET;
	({ bridgeRecordId, mintBridgeToken } = await import("../lib/agent-bridge"));
});

const rep = {
	id: "user_123",
	email: "lewis@trycomp.ai",
	name: "Lewis Carhart",
};

describe("mintBridgeToken", () => {
	it("keeps stable seeded record ids as Agent context", () => {
		expect(bridgeRecordId("seed-deal-fernhill-systems-1")).toBe(
			"seed-deal-fernhill-systems-1",
		);
		expect(bridgeRecordId("../../not-a-record")).toBeUndefined();
	});

	it("mints a token eve accepts", async () => {
		const token = await mintBridgeToken(rep);
		const result = await verifyJwtHmac(token, CONFIG);

		expect(result.ok).toBe(true);
	});

	it("names the rep, so the agent knows a person is driving", async () => {
		// The whole reason this is not a shared service credential: the approval
		// policy on the agent side behaves differently for a person than for the
		// cron principal, and `ask_question` only makes sense when someone is
		// there to answer.
		//
		// The *subject* is the rep. eve's own principal mapping labels an HMAC
		// token as a service and namespaces its id (`crm-app:user_123`), which is
		// the right default for a machine credential and wrong for this — so the
		// agent re-maps it in `repFromCrm`, and `channel-auth.spec.ts` covers that
		// half.
		const token = await mintBridgeToken(rep);
		const result = await verifyJwtHmac(token, CONFIG);

		expect(result.ok && result.sessionAuth.subject).toBe(rep.id);
		expect(result.ok && result.sessionAuth.attributes?.email).toBe(rep.email);
	});

	it("carries the focused record through eve's verified attributes", async () => {
		const token = await mintBridgeToken(rep, {
			dealId: "seed-deal-fernhill-systems-1",
		});
		const result = await verifyJwtHmac(token, CONFIG);

		expect(result.ok).toBe(true);
		expect(result.ok && result.sessionAuth.attributes?.dealId).toBe(
			"seed-deal-fernhill-systems-1",
		);
	});

	it("is rejected by a different secret", async () => {
		const token = await mintBridgeToken(rep);
		const result = await verifyJwtHmac(token, {
			...CONFIG,
			secret: "a-different-secret-entirely",
		});

		expect(result.ok).toBe(false);
	});

	it("is rejected by an agent expecting another audience", async () => {
		const token = await mintBridgeToken(rep);
		const result = await verifyJwtHmac(token, {
			...CONFIG,
			audiences: ["someone-elses-agent"],
		});

		expect(result.ok).toBe(false);
	});

	it("expires, so a token left in a tab stops working", async () => {
		const token = await mintBridgeToken(rep);
		const [, payload] = token.split(".");
		const claims = JSON.parse(
			Buffer.from(payload as string, "base64url").toString(),
		) as { exp: number; iat: number };

		const lifetime = claims.exp - claims.iat;
		expect(lifetime).toBeLessThanOrEqual(300);
		expect(lifetime).toBeGreaterThan(30);
	});

	it("refuses to mint without a secret", async () => {
		const secret = process.env.AGENT_BRIDGE_SECRET;
		process.env.AGENT_BRIDGE_SECRET = "";

		expect(mintBridgeToken(rep)).rejects.toThrow();

		process.env.AGENT_BRIDGE_SECRET = secret;
	});
});
