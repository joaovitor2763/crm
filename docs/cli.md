# CRM CLI

`@crm/cli` is a small Bun CLI for credential-authenticated integration
workflows. It uses the existing `/health`, `/api/v1` and `/mcp` surfaces; it
does not bypass API authorization or connect to the database.

## Configuration

Set `CRM_API_URL` and `CRM_API_TOKEN` in the environment, or pass
`--base-url` and `--token` for a one-off invocation. Tokens are never included
in output or error messages. Prefer environment variables in shell history and
CI. Requests time out after 15 seconds by default; override with
`--timeout-ms`.

The CLI emits JSON by default, which is suitable for agents and scripts. Add
`--human` for a compact human-readable summary.

## Commands

```sh
bun run --filter=@crm/cli build
bun run --filter=@crm/cli check-types
bun run --filter=@crm/cli test

crm health
crm lead upsert \
  --source website \
  --business-unit-id business-unit-default \
  --first-name Ada \
  --email ada@example.test \
  --idempotency-key website-ada-1
crm contact list --limit 20
crm contact get CONTACT_ID
crm mcp tools
crm mcp call search_contacts --args '{"name":"Ada","limit":10}'
```

`lead upsert` maps to the API's idempotent lead-ingestion endpoint. It requires
`--source`, `--business-unit-id`, `--first-name` and either `--email` or
`--phone`; additional API fields can be passed through the corresponding flags.
`mcp call` preserves the server's structured result so a caller can use any
tool exposed by the credential without the CLI needing a release for every new
tool.
