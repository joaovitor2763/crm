# Database package rules

Read `../../docs/environment.md`, the Prisma skill, `README.md`, and the current
schema before changing this package.

## Schema and generated code

- `prisma/schema.prisma` is the source of truth. Every production schema change
  needs a reviewed migration created with `bun run db:migrate`; `db:push` is for
  disposable prototyping only.
- Better Auth owns `User`, `Session`, `Account`, `Verification`, and `RateLimit`.
  Change auth configuration in `packages/auth`, run `bun run auth:generate`,
  then review the schema diff and create a migration. Do not casually hand-edit
  generated auth models.
- `src/generated` is disposable, gitignored Prisma Client output. Never edit or
  commit it; regenerate with `bun run db:generate`.
- Keep the Prisma 7 PostgreSQL driver-adapter setup in `src/client.ts`. Consumers
  import the singleton and exported types through `@crm/db`, not generated paths.

## Migration and data safety

- Local destructive commands are guarded by
  `scripts/require-local-db.ts`. Never bypass the guard or set
  `ALLOW_REMOTE_DB=1` unless the user explicitly intends to mutate the resolved
  remote database and the target has been verified.
- `db:deploy` is intentionally the non-interactive production command;
  `db:migrate`, `db:push`, `db:reset`, and `db:seed` are local workflows.
- Make migrations forward-safe. Preserve existing data explicitly when
  replacing or dropping columns, and inspect generated SQL before applying it.
- The seed is the repository's sole sanctioned demo-data source. Keep it
  deterministic and idempotent, use fictional people, and never copy real
  customer names, addresses, emails, or business records into it.
- Add indexes and stable ordering for real query patterns. Keep comments that
  record denormalization, uniqueness, or deletion-policy tradeoffs.

## Environment and verification

The Prisma CLI and client load the repository-root `.env` through `@crm/env`.
Never create `packages/db/.env` or rely on a package working directory's Bun
autoload behavior.

After a schema change, run:

```sh
bun run db:generate
bun run --filter=@crm/db check-types
bun run --filter=@crm/db lint
bun run test
```

Run the relevant migration command only against the verified local Docker
database unless the user explicitly requests a deployment.
