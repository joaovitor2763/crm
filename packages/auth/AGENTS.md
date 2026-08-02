# Authentication package rules

Read `README.md`, `../../docs/environment.md`, `../../docs/api.md`, and the
Better Auth skill before editing authentication.

## Security model

- This is a single-tenant internal CRM. `ALLOWED_SIGN_IN` is the real door and
  must fail closed when empty. Apply the allow-list to every account-creation
  path; provider hints such as Google's `hd` are UX, never authorization.
- Do not add organizations, roles, or per-record permissions here. Changing the
  authorization model requires an explicit product/security decision, not a
  compatibility stub.
- Keep the server configuration framework-agnostic. The Nest API owns the
  Better Auth HTTP handler; the Next app consumes sessions and the shared client.
- Keep server and client plugins aligned. Preserve database-backed rate limiting,
  secure production cookies, trusted origins, and the shared cookie-domain
  behavior unless the change explicitly replaces them.

## Configuration and schema

- `src/auth.ts` is the source of Better Auth behavior, `src/workspace.ts` owns
  allow-list parsing, and `src/scopes.ts` owns the Google data scopes. Centralize
  changes in those files rather than duplicating rules in apps.
- This JIT package exports TypeScript sources to preserve inferred Better Auth
  types. Do not add declaration-build indirection or deep cross-package imports.
- Environment values come from the single root `.env` through `src/env.ts` and
  `@crm/env/load`. New values must be documented in `.env.example`, and API-read
  values must also be validated by the API.
- Plugin or additional-field changes may alter Prisma models. Run
  `bun run auth:generate`, inspect the schema diff, then create a database
  migration. The generator is additive, so removed plugin fields may require an
  explicit reviewed schema cleanup.

Verify with:

```sh
bun run --filter=@crm/auth auth:generate  # only when auth schema changed
bun run --filter=@crm/auth check-types
bun run --filter=@crm/auth lint
bun run --filter=api test
```
