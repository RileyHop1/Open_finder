# @hearthtable/client

Vue 3 + Vite, with PixiJS for the map canvas. Everything the table actually
looks at.

## What lives here
- **The canvas** — PixiJS scene rendering, tokens, grid, and movement. Major
  version pinned; upgrading it is its own reviewed PR
- **Sheets, the party bar, and the action bar**
- **Tooltips and the encyclopedia** — the "hover to learn" system
- **Modifier breakdowns** — rendered from the `Statistic` that computed the
  number, never recomputed (`docs/adr/0008-modifier-resolution.md`)
- **Pinia stores**, which apply operations optimistically and **must** be able
  to roll them back

## Rules this package lives under
- **Optimistic updates must reconcile.** On rejection, roll back to the last
  server-confirmed state. A client never silently diverges.
- **Keyboard parity.** Every drag-and-drop affordance ships a keyboard or
  context-menu equivalent in the same PR.
- **Tablets are supported, phones are not.** Every tooltip works on tap, touch
  targets are at least 44px, and sheets are usable at 1024px wide.
- Condition and status icons never rely on color alone.

## How it fits
Depends on `@hearthtable/core`, `@hearthtable/dice`, and `@hearthtable/pf2e`.
Sends operations; never writes to storage directly.
