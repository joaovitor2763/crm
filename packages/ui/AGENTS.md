# Shared UI rules

Read `../../docs/design.md` and the local shadcn skill before editing this
package. This directory is the design system and the only source of reusable UI
for the application.

## Components and styling

- Search existing `src/components` before adding markup or a new primitive.
  Prefer composition and existing variants.
- Consumers must not restyle shared components. If the product needs a visual
  or behavioral option, add a typed variant here so all call sites share it.
- Keep the product's geometry restrained: use the shared radius scale for
  controls, cards, and floating surfaces, while tables, dividers, attached
  sheets, and structural edges stay square. Never add arbitrary radii or turn
  every control into a pill. Use semantic theme tokens rather than raw colors,
  one-off shadows, or manual dark-mode color pairs.
- `className` inside a primitive may implement the primitive; at consumer call
  sites it is for layout only. Use `cn()` for conditional classes, `gap-*` for
  spacing, and `size-*` when width and height match.
- Preserve accessible composition: titles for dialogs/sheets/drawers, grouped
  menu/select items, avatar fallbacks, labels and invalid state for controls,
  and visible focus behavior.
- App-facing Carbon glyphs go through `components/icon.tsx` so motion and sizing
  stay consistent. Vendored shadcn internals may retain their configured Lucide
  icons.

## shadcn source and exports

- Run shadcn through Bun from this workspace, for example
  `bun run --filter=@crm/ui ui:add -- button`. Inspect the installed component
  and its imports after generation.
- Components and `use-mobile.ts` are intentionally excluded from Biome so
  upstream diffs stay readable. Do not bulk-format vendored shadcn source.
- Add each public component, hook, or helper through the wildcard export layout
  already declared in `package.json`; consumers import
  `@crm/ui/components/foo`, never a filesystem path.
- Keep the Tailwind v4 theme in `src/styles/globals.css`. Do not create a second
  theme or app-local token set.
- Do not use raw `useEffect` in shared hooks. Prefer derived state and event
  handlers; the explicit mount-only escape hatch is `hooks/use-mount-effect.ts`.

Verify with:

```sh
bun run --filter=@crm/ui check-types
bun run --filter=@crm/ui lint
```
