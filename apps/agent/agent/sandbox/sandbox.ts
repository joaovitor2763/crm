import { defaultBackend, defineSandbox } from "eve/sandbox";

/**
 * The agent's shell, with the network taken away.
 *
 * Turning a sandbox on is what gives the model `bash`, `read_file`,
 * `write_file`, `glob` and `grep` — the difference between a tool-caller and
 * something that can keep a dossier on a person, diff this month's profile
 * against last month's, and grep a thread for a signature block.
 *
 * `deny-all` costs nothing, because `web_fetch` and the authored vendor tools
 * execute in the app runtime, so retrieval is unaffected by the sandbox having
 * no egress. What it removes is
 * the only path by which customer email bodies — which this agent reads in full
 * — could leave the building through a shell command.
 *
 * The other half of that rule is not here, because it is an absence: **the
 * sandbox is never given `DATABASE_URL`.** Backends take explicit `env`, so
 * nothing is inherited. CRM access is authored tools in the app runtime, never
 * `psql`. A shell with credentials and egress is exfiltration-shaped even in an
 * internal tool; a shell with neither is a text processor.
 *
 * The policy is set on the backend factory rather than in `onSession` so it
 * applies to every session by construction — a per-session call is a per-session
 * call somebody can forget. No backend is pinned: `defaultBackend()` resolves
 * Vercel Sandbox in production and Docker or microsandbox locally, and each one
 * is told the same thing.
 */
export default defineSandbox({
	backend: defaultBackend({
		vercel: { networkPolicy: "deny-all" },
		docker: { networkPolicy: "deny-all" },
		microsandbox: { networkPolicy: "deny-all" },
	}),
});
