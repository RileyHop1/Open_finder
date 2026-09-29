# @hearthtable/client

Vue 3 + Vite, with PixiJS for the map canvas. Everything the table actually
looks at.

## Running it

```bash
pnpm --filter @hearthtable/client dev
```

Starts Vite's dev server (default `http://localhost:5173`). `/api` and
`/socket.io` are proxied to `@hearthtable/server`'s default address
(`http://127.0.0.1:3000`) — start that separately (`pnpm --filter
@hearthtable/server dev`) for the campaign screen to have real data to show.
Verified directly: with both dev servers running, `GET`/`POST
/api/worlds` through Vite's proxy round-trip to a real running server and a
real SQLite-backed world. `pnpm --filter @hearthtable/client build` produces
the static output `apps/server` serves in production (`staticDir` in
`apps/server/src/app.ts`); there is no separate client server in production.

## What lives here
- **The scaffold** (`main.ts`, `App.vue`, `vite.config.ts`, `src/styles/tokens.css`)
  — Vite + Vue 3 (`<script setup lang="ts">`) + Pinia. `tokens.css` holds the
  design tokens (CSS custom properties on `:root`, redefined under a
  dark-mode media query) and the a11y baseline: visible `:focus-visible`
  outlines and a 44px minimum touch target on interactive elements, both
  enforced once here rather than per component. `App.vue`'s skip link is the
  first concrete instance of "every action reachable without a mouse."
  **Built.**
- **The GM's campaign screen** (`components/CampaignSelect.vue`,
  `stores/worlds.ts`, `api/worlds.ts`) — the app's first real screen (the
  milestone 1 user story: "GM opens the app and sees their campaigns, picks
  one"). Lists every campaign, creates one, activates one. `api/worlds.ts` is
  plain `fetch` against `apps/server`'s REST setup routes (`GET`/`POST
  /api/worlds`, `POST /api/worlds/:id/activate`, `GET /api/worlds/active`) --
  not an ADR 0005 operation, since campaign setup happens before anyone
  connects over the realtime channel. Every response is validated against
  `@hearthtable/core`'s own `worldSchema` before the store ever sees it.
  **Built.**
- **The canvas** — PixiJS scene rendering, tokens, grid, and movement. Major
  version pinned; upgrading it is its own reviewed PR. Not yet
- **Sheets, the party bar, and the action bar**. Not yet
- **Tooltips and the encyclopedia** — the "hover to learn" system. Not yet
- **Modifier breakdowns** — rendered from the `Statistic` that computed the
  number, never recomputed (`docs/adr/0008-modifier-resolution.md`). Not yet
- **Pinia stores that apply realtime operations optimistically and must be
  able to roll them back** (ADR 0005) -- not yet; `stores/worlds.ts` above is
  a plain REST-backed store, not this. Lands with the lobby and chat
  (Socket.IO), the next two PRs

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
