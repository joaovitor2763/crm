# Next steps: a light CRM with real governance

## Goal

Keep the CRM single-tenant and lightweight while making it safe and useful for
multiple teams, business units, marketing qualification and external AI agents.
The implementation must sustain thousands of lead submissions per day without
introducing organization/tenant plumbing or moving intelligence into Nest.

## Decisions implemented

- A lead is a `Contact`. Qualification is `ContactBusinessUnitState`: the same
  contact may be MQL in one unit and Lead in another. `Contact` stores the
  consolidated highest lifecycle, global MQL timestamp/reason and max score.
- Every user has one `Role`. Visibility combines its action scope with unit and
  team memberships; units form a closure-table hierarchy. Existing users are
  migrated to Global Admin and new users start Read Only.
- Business units and teams are governance partitions inside one tenant. They do
  not appear in auth cookies as organizations and are never billing tenants.
- Custom objects and typed fields use JSON for the normal record read plus a
  sparse typed projection only for indexed/unique fields. This keeps ordinary
  writes cheap while supporting number, text, boolean, date and select queries.
- Lead intake is append-only at the boundary. Accepted, duplicate and rejected
  attempts retain the original payload, routing, actor and validation outcome.
- Automations use a small validated DSL, never stored JavaScript. Domain events,
  automation runs and webhook deliveries are durable, leased and idempotent.
- Public REST and MCP share hashed credentials, roles and scopes. The cleartext
  token is shown once; external principals never inherit Global Admin bypass.
- The record Agent tab carries a signed record identity. Eve builds a natural
  scoped preamble for that contact, company or deal and rechecks authorization
  at each tool execution.

## Integration surface

Create a scoped credential in **Settings → External access**. Use the returned
token once; only its hash remains in the database.

```sh
curl -X POST "$API_URL/api/v1/leads" \
  -H "authorization: Bearer $CRM_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "source": "landing-page",
    "idempotencyKey": "submission-123",
    "businessUnitId": "business-unit-default",
    "firstName": "Demo",
    "email": "demo@example.test"
  }'
```

The response is a durable submission receipt. It deliberately does not expose
the canonical contact id; integrations with read permission resolve the contact
through the scoped contact search endpoint. This prevents a credential from
probing whether another business unit already holds a globally unique email.

Point a Streamable HTTP MCP client at `$API_URL/mcp` with the same bearer token.
The initial tools are `submit_lead`, `get_contact` and `search_contacts`.

## Scale and operations

- Lead idempotency keys and external IDs are unique per source, business unit
  and team. Submissions without a team use a separate unassigned namespace, so
  one scoped integration cannot consume or infer another team's intake result.
- Unit lifecycle queries, team ownership and outbox leases have dedicated
  indexes; domain events also have a BRIN timestamp index for append-heavy use.
- Workers claim bounded batches and retry with exponential backoff. No request
  waits for an automation or webhook delivery.

### Scoped lead-idempotency rollout

The scoped lead migrations intentionally remove the legacy global indexes before
the new application is serving traffic. Deploy them in a maintenance window:

1. Stop or drain `POST /api/v1/leads` and the `submit_lead` MCP tool, and stop
   any other writer that creates `LeadSubmission` rows.
2. Apply, in order, `20260802180000_scope_lead_idempotency`,
   `20260802190000_team_scoped_lead_idempotency`, and
   `20260802200000_preserve_team_idempotency_tombstones` with
   `bun run --filter=@crm/db db:deploy`.
3. Deploy the API code that reads and writes the team-scoped namespace, then
   smoke-test team, unassigned, replay, invalid-payload and tombstone paths.
4. Resume lead traffic only after the scoped API is healthy. Do not leave an
   older API binary serving intake between these steps.

Downtime is deliberate here: it prevents an old reader or writer from observing
the index transition. The migration chain preserves `team:<id>` tombstones when
team deletion nulls the foreign key; new teamless rows use `none`.

## Deliberate limits

- API credential issuance remains Global Admin-only. Delegated credential
  administration needs a separate policy for preventing privilege escalation.
- Automation actions currently cover lifecycle, assignment and archive. More
  actions extend the validated DSL and tests; they do not add arbitrary code.
- Permanent deletion remains outside the operational UI. Archive/restore keeps
  commercial history intact.

## Release hardening

- Ownership, team and business-unit assignments are validated as one scoped
  tuple. Non-user principals with `OWNED` access fail closed.
- Public REST and MCP return only lifecycle states visible to the credential;
  cross-scope email matches become review submissions without exposing a
  contact identifier.
- Webhooks accept only public HTTPS destinations, reject redirects and stop
  leasing deliveries while an endpoint is inactive.
- Governance mutations and overviews are constrained to the acting principal's
  administrative scope; only a global administrator can grant global roles or
  modify global schema.
