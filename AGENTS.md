# CRM repository instructions

These rules apply to the whole monorepo. Read the closest nested `AGENTS.md`
before changing files in one of its directories; nested rules add to these.

## Before making changes

- Inspect the relevant implementation, tests, package manifest, and nearby
  documentation before editing. Do not work from framework memory when local
  documentation is available.
- Review every relevant skill in `.agents/skills/` before working on that stack.
  In particular, use the Turborepo, NestJS, Better Auth, Prisma, Eve, React,
  nuqs, and shadcn skills when their code is in scope. Tell the user which
  repository docs and skills you read.
- UI work must read `docs/design.md`.
- API work must read `docs/api.md`.
- Research-agent work must read both `docs/agent.md` and `docs/api.md`.
- Environment or deployment work must read `docs/environment.md`.
- Changes that ship publicly must follow `CONTRIBUTING.md` and `SECURITY.md`.

## Architecture and ownership

| Path | Owns |
| --- | --- |
| `apps/app` | Next.js App Router UI, URL state, tRPC consumption, and the authenticated Eve proxy |
| `apps/api` | NestJS HTTP/auth/tRPC surface and Google sync |
| `apps/agent` | All research, enrichment, scoring, identity matching, and other intelligence |
| `packages/ui` | The shared design system and every reusable UI primitive |
| `packages/db` | Prisma schema, migrations, seed data, and the shared client |
| `packages/auth` | Better Auth configuration and the sign-in allow-list |
| `packages/env` | Loading the single repository-root environment file |

Preserve these boundaries:

- Intelligence never belongs in the API. Nest records that something happened
  by creating an `AgentTask`; the Eve app decides what it means.
- The application is intentionally single-tenant. Business units and teams are
  internal governance partitions, not organizations or tenant IDs. Every user
  has one role; record visibility is resolved from that role plus unit/team
  membership. Do not add organization or tenant plumbing.
- The web app's business-data surface is tRPC. REST is reserved for Better Auth,
  session/profile, health, internal workers, and the credential-authenticated
  public lead/contact API plus Streamable HTTP MCP endpoint.
- Reusable UI belongs in `packages/ui`; consumers import through package exports
  and do not reach into another workspace's `src` directory.

## Tooling and workflow

- Use Bun (the pinned package manager is Bun 1.3.12; Node must be 22 or newer).
- Run repository tasks from the root. Root scripts only delegate to
  `turbo run`; package-specific logic belongs in the relevant package script.
- Prefer focused commands while iterating, for example
  `bun run --filter=api test` or `bun run --filter=app check-types`.
- Declare workspace dependencies with `workspace:*` and import them through the
  package's public `exports`. Never use relative paths across package boundaries.
- Keep package-specific Turbo behavior in that package's `turbo.json`. When a
  task produces files, keep its `outputs`, inputs, and environment declarations
  accurate.
- Formatting and linting use Biome. Preserve tabs and double quotes in authored
  TypeScript. Comments should explain constraints or history, not restate code.
- Never edit generated output. Regenerate it with its owning command and commit
  it only when the repository intentionally tracks it.

## Environment and data safety

- This repository deliberately uses one `.env` at the root. Never add a
  per-package environment file. `.env.example` is the complete documentation.
- When adding an environment variable, document it in `.env.example`; if the API
  reads it, also declare it in `apps/api/src/config/env.validation.ts`. Declare
  it in the appropriate Turbo task as well.
- Optional integrations must degrade by removing a capability. A missing key
  must not make an otherwise valid install fail.
- Never copy production credentials into a loader-visible `.env.local`. Use
  `vercel env pull .env.vercel` when reference values are needed.
- Never put real customer names, addresses, or company data in fixtures, tests,
  screenshots, logs, or documentation. `packages/db/prisma/seed.ts` is the sole
  source of sanctioned demo data; never copy customer data into it.
- Do not log headers, cookies, request bodies, mailbox contents, or secrets.

## Validation

Run the narrowest relevant test while iterating. Before handing off a code
change, run the affected package's available `check-types`, `lint`, and `test`
tasks. For cross-cutting changes, run the repository-wide gates:

```sh
bun run check-types
bun run lint
bun run test
```

State which checks ran and which could not run. Integration tests that need
Postgres should use the local Docker database, never a remote database.
