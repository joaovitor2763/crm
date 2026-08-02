<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any Next.js code. Heed deprecation
notices.
<!-- END:nextjs-agent-rules -->

# Web application rules

Read `../../docs/design.md` for all UI work and the freshness section of
`../../docs/api.md` for any query or mutation. For the Agent panel or
`app/eve/v1` proxy, also read `../../docs/agent.md`.

## Rendering and data flow

- Use App Router Server Components by default. Add `"use client"` only at the
  smallest boundary that needs browser APIs, event handlers, or client hooks.
- Business data comes through the typed tRPC helpers in `lib/trpc`. Server
  pages prefetch into the shared query client and hydrate client components;
  interactive reads use the generated `queryOptions`/`mutationOptions`.
- List filters, sort, pagination, active records, tabs, and other shareable view
  state live in the URL with nuqs. Define and reuse typed parsers in the nearby
  `*-search-params.ts` module instead of duplicating string parsing or mirroring
  URL state in React state.
- Mutations invalidate through `useCrmCache()` in `lib/trpc/cache.ts`. Add the
  semantic fan-out there instead of spelling query keys at call sites. Use
  `{ settle: "record" }` for inline editors.
- Use `pathKey()` when invalidating a procedure consumed as both a normal and an
  infinite query. For agent/background writes, poll only while the shared
  enrichment state is pending or running, using `isEnriching()` and
  `ENRICHMENT_POLL_MS`.

## React and UI

- Do not call `useEffect` for derived state, fetching, user actions, or resetting
  on prop changes. Derive during render, use TanStack Query, act in event
  handlers, or remount with a `key`. For a true mount-only external subscription,
  use `@crm/ui/hooks/use-mount-effect`.
- Import primitives from `@crm/ui/components/*`. Do not recreate shared buttons,
  fields, sheets, tables, empty states, chat primitives, or design tokens under
  this app.
- `className` may arrange application layout, but it must not restyle a shared
  component. Add a reusable variant or capability in `packages/ui` instead.
- Preserve accessibility primitives: overlays need titles, icon-only controls
  need accessible labels, avatars need fallbacks, and loading controls remain
  disabled while their mutation is pending.
- Use the shared chat primitives and `MessageScroller` behavior in the Agent
  panel. Do not hand-roll streaming scroll state.

## Record and agent integration

- `lib/agent-record.ts` is the single mapping from contact/company/deal to proxy
  header, token claim, conversation field, and empty-thread copy. Extend it once
  rather than branching independently across UI layers.
- The browser talks to Eve only through same-origin `/eve/v1/*`. The proxy must
  authenticate the Better Auth session, strip cookies, and carry record context
  in the short-lived bridge token, never in the user's message.
- Keep a live Agent panel mounted when switching tabs, and use Eve's session
  snapshot/continuation APIs rather than reconstructing its stream protocol.

## Generated types and verification

The app imports `AppRouter` from the committed API output. If a new procedure is
missing, run `bun run --filter=api trpc:generate` and commit
`apps/api/src/generated/server.ts` with the router change.

For app changes, run:

```sh
bun run --filter=app check-types
bun run --filter=app lint
bun run --filter=app test
```
