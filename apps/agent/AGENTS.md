# Eve research-agent rules

Read `../../docs/agent.md`, `../../docs/api.md`, and
`../../docs/environment.md` before editing this app. Then start at
`node_modules/eve/docs/README.md` and read the exact bundled guide for the Eve
primitive being changed. The installed documentation, not memory or web
examples for another version, is authoritative.

## Ownership and evidence

- This deployment owns all intelligence: research, enrichment, identity
  matching, confidence bands, summaries, and the writes derived from them. Do
  not duplicate any of it in `apps/api`.
- A tool reports observations as evidence. It never accepts model-authored
  confidence or a URL alone as proof. `agent/lib/evidence.ts` prices evidence,
  and `agent/lib/facts.ts` is the only path that applies or proposes contact
  facts.
- Never overwrite a human value, re-offer a dismissed proposal, or write a fact
  without primary evidence. `PROBABLE` requiring a rep decision is a valid
  outcome.
- When adding a fact field, update both `FIELDS` in `agent/lib/facts.ts` and
  `FACT_COLUMNS` in `apps/api/src/contacts/contacts.service.ts`.

## Capabilities, budget, and queue

- Every third-party source is optional. Register its environment dependency in
  `agent/lib/capabilities.ts`, check availability before charging budget, and
  return the shared non-retryable unavailable result when absent. Missing keys
  must never crash the agent.
- Every vendor call charges the session budget in `agent/lib/focus.ts`.
  Exhaustion is a normal completion state.
- `agent/lib/tasks.ts` owns leasing. `agent/schedules/dispatch.ts` remains the
  only schedule and only dispatches due work; scheduling policy belongs in
  `dueAt`, and follow-ups go through `schedule_recheck` with a human-readable
  reason.

## Navigability and session context

- Reads and preambles that name contacts, companies, or deals must include
  their IDs and the IDs of neighboring records. Never strand the model with a
  display name that cannot be passed to the next tool.
- `search_crm` remains conservative; do not add fuzzy matching that can choose
  the wrong real person.
- `agent/lib/preamble.ts` varies by record kind and by dispatched-task versus
  rep conversation. Extend the centralized mapping and its integration tests
  when adding a record kind.

## Privacy, sandbox, and bridge

- Customer text may be read inside the CRM, but third-party searches receive
  only derived queries. Never write mailbox content to `/workspace`, and never
  log sensitive text. Keep `agent/skills/data-boundaries.md` synchronized with
  the code-level boundary.
- The sandbox keeps deny-all egress and never receives `DATABASE_URL`. CRM
  access happens only through authored runtime tools.
- The CRM bridge is optional and fails closed. Preserve the real-user principal
  mapping in `agent/channels/eve.ts`; generic service-principal HMAC mapping is
  not sufficient for human approval decisions.

## Tests and verification

Put pure behavior in unit tests and database invariants in integration tests.
Agent integration tests intentionally use a real local Postgres database.

```sh
bun run --filter=agent check-types
bun run --filter=agent lint
bun run --filter=agent test
bun run --filter=agent build  # for Eve discovery/compile changes
```

After changing authored Eve files, inspect `/eve/v1/info` or the build
diagnostics so silently undiscovered tools, skills, schedules, or channels are
not mistaken for working code.
