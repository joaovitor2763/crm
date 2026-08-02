# Design — Rules for AI Agents

- /packages/ui is the single source of truth for all UI.
- Always use shared shadcn components from /packages/ui.
- Do not override component styles with className.
- Do not introduce custom border radii, spacing, colours, shadows, or other visual deviations.
- Use the shared radius scale deliberately: controls and cards use a modest
  radius, while floating surfaces may use the next larger token. Keep tables,
  dividers, attached sheets, and structural layout edges square. Avoid pills
  except where the shape communicates state, such as avatars and switches.
- If a component needs a new variant or style, implement it in /packages/ui so the entire application stays consistent.
