# Environment-loader rules

Read `../../docs/environment.md` before editing this package. This code runs
before most application code, so small ordering changes have repository-wide
effects.

- The repository intentionally has one root `.env`, optionally overlaid by the
  root `.env.local`. Never add per-package env discovery.
- Find the workspace root by a `package.json` with `workspaces`. Do not switch to
  the nearest `package.json` or `turbo.json`; apps have their own copies and that
  silently resolves the wrong directory.
- Real process environment values always win. Merge `.env` and `.env.local`
  first, then fill only missing `process.env` keys.
- Keep loading idempotent and tolerant of missing files. Validation belongs to
  each consumer; this package must not make optional configuration fatal.
- Keep the parser deliberately small and deterministic. Add a focused parser or
  root-discovery test for every new syntax or lookup behavior.
- Preserve the side-effect entry point `@crm/env/load` for modules that read
  environment values during ESM evaluation.

Verify with:

```sh
bun run --filter=@crm/env check-types
bun run --filter=@crm/env lint
bun run --filter=@crm/env test
```
