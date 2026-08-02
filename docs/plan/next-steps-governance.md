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

Point a Streamable HTTP MCP client at `$API_URL/mcp` with the same bearer token.
The initial tools are `submit_lead`, `get_contact` and `search_contacts`.

## Scale and operations

- Lead idempotency keys and external IDs are indexed by source.
- Unit lifecycle queries, team ownership and outbox leases have dedicated
  indexes; domain events also have a BRIN timestamp index for append-heavy use.
- Workers claim bounded batches and retry with exponential backoff. No request
  waits for an automation or webhook delivery.
- The migrations are additive for the current release, so they can be applied
  before the preview deployment without a maintenance window. Future destructive
  changes still need expand/contract deployment.

## Deliberate limits

- API credential issuance remains Global Admin-only. Delegated credential
  administration needs a separate policy for preventing privilege escalation.
- Automation actions currently cover lifecycle, assignment and archive. More
  actions extend the validated DSL and tests; they do not add arbitrary code.
- Permanent deletion remains outside the operational UI. Archive/restore keeps
  commercial history intact.
