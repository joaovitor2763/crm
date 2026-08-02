# NestJS API rules

Read `../../docs/api.md` before editing this app. Read
`../../docs/environment.md` for configuration work and the Better Auth and
NestJS skills for authentication or framework changes.

## Boundary

- This app owns transport, authentication, tRPC, caching, and Google sync. It
  must not research, enrich, score, summarize, match identities, or call
  intelligence vendors. Create an `AgentTask` through
  `src/agent/agent-trigger.service.ts`; implement the intelligence in
  `apps/agent`.
- The product is single-tenant. A valid session is the authorization model. Do
  not introduce organizations or permission checks that always succeed.
- tRPC under `/api/trpc` is the business-data surface. REST controllers are
  limited to Better Auth, the small `/auth/me` and `/auth/session` reads,
  `/health`, and the guarded internal sync endpoint.

## Feature shape and tRPC

- Organize features as a Nest module with `*.contracts.ts`, a thin
  `*.router.ts`, and a `*.service.ts`. Routers validate with zod and delegate;
  Prisma queries and domain behavior live in services.
- Every private router uses `@Router({ alias: "..." })` and
  `@UseMiddlewares(AuthMiddleware)`. Omitting the middleware makes the entire
  router public.
- Services throw Nest `HttpException` subclasses. Let
  `DomainErrorMiddleware` translate them for tRPC; do not make services depend
  on tRPC error types.
- Filter, sort, paginate, and calculate facets in Prisma. Reuse `listInput`,
  `paginate`, and `resolveOrderBy`, with an explicit sortable-column map and a
  stable tiebreaker. Never fetch a table to filter it in the browser or
  interpolate an untrusted field into `orderBy`.
- Use constructor injection. Remember that Nest runtime DI metadata needs value
  imports; do not mechanically convert provider imports to `import type`.

## Generated router contract

- `src/generated/server.ts` is generated and committed. Never hand-edit it.
- Run `bun run --filter=api trpc:generate` after changing a router and commit the
  output in the same change.
- Do not add generation to `build`; the native generator is incompatible with
  the deployment image. It belongs in local development and `check-types` only.

## Logging, auth, and configuration

- Use Nest's `Logger`, never `console.*`. Attach structured fields as one object:
  `logger.log({ message: "Saved", userId })`. Pass an error stack as the second
  argument to `logger.error`.
- Never log request headers, query strings, bodies, cookies, OAuth tokens,
  mailbox text, or other personal data. Request and user correlation already
  come from the logging context.
- Keep `LoggingModule` first in `AppModule`. Better Auth mounts before normal
  Nest middleware and uses its explicit logging middleware.
- Environment variables are validated in `src/config/env.validation.ts`. Any
  new API variable also belongs in the root `.env.example` and the relevant
  Turbo task. Optional capabilities must remain optional.
- The Google sync is forward-only. Its internal route fails closed without a
  valid `CRON_SECRET`; do not add a backfill or an enable flag by default.

## Caching and tests

- Cache only deliberate read-through values. Every cached write path needs an
  explicit invalidation path. Redis is optional; the in-memory fallback must
  keep local development correct.
- Add focused unit tests beside the existing `test/*.spec.ts` patterns. E2E
  tests that import `AppModule` must set required environment variables before
  the dynamic import.

Run:

```sh
bun run --filter=api trpc:generate  # when routers changed
bun run --filter=api check-types
bun run --filter=api lint
bun run --filter=api test
```
