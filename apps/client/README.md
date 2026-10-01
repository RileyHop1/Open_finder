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
@hearthtable/server dev`) for either screen to have real data: create a
campaign, activate it, and the app switches to its lobby, where a seat can
actually be added and claimed against the real server. `pnpm --filter
@hearthtable/client build` produces the static output `apps/server` serves in
production (`staticDir` in `apps/server/src/app.ts`); there is no separate
client server in production.

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
- **The realtime connection** (`stores/connection.ts`, `realtime/`) — the one
  Socket.IO connection this app makes, shared by the lobby and chat rather
  than each owning its own. `realtime/socket.ts` opens it typed against
  `@hearthtable/core`'s shared `ClientToServerEvents`/`ServerToClientEvents`
  contract (so this app and `apps/server` cannot drift on the wire protocol),
  authenticated with a device token persisted in `localStorage`
  (`realtime/deviceToken.ts`, ADR 0007). `connectionStore` knows nothing about
  `seats` or `documents` specifically -- it just tracks connection `status`
  and the last `broadcast`; `stores/lobby.ts` and `stores/chat.ts` each watch
  that and pull out whatever they care about. **Built.**
- **The lobby** (`components/CampaignLobby.vue`, `stores/lobby.ts`,
  `api/seats.ts`) — shown instead of CampaignSelect once a campaign is active
  (`App.vue`'s own reactive switch, no router). Lists every seat, lets a GM
  add one, and lets anyone claim or release one -- "click a character to
  become them... unclick if you picked wrong" (the milestone 1 user story and
  ADR 0007). Fetches the current seat list over REST on connect and on every
  reconnect (a full snapshot is simpler than replaying the operation log,
  which has no device-token information to reconstruct "which seat is mine"
  from anyway), then keeps it live from the shared connection's broadcasts,
  merged in by seat id since a broadcast only ever carries what changed.
  Claiming a PIN-protected seat asks for the PIN inline rather than claiming
  immediately; the client never pre-checks it against the (visible, per
  `seatSchema`'s own "not a secret" docs) fetched value -- it just submits
  whatever the user enters and lets the server's own `seat.claim` handler
  accept or reject it. **Built.**
- **Chat** (`components/ChatLog.vue`, `stores/chat.ts`, `api/chat.ts`) --
  rendered inside CampaignLobby, alongside the seat list: milestone 1's "chat
  with a dice roll," the thin thread's own proof point end to end (schema ->
  SQLite -> operation -> sequence -> broadcast -> Pinia store -> DOM). A
  leading `/roll <expression>` dispatches `chat.sendRoll` instead of a plain
  `chat.sendMessage`; a roll's term-by-term breakdown renders in a `<details>`
  disclosure, reachable by keyboard and tap, not by mouse hover alone.
  History loads once over `apps/server`'s `GET
  /api/worlds/:id/documents?type=chatMessage` (the operation log can't
  reconstruct it: a `chat.sendRoll` operation's payload is the raw typed
  expression, not the evaluated result), then stays live from broadcasts.
  **Sending is optimistic (ADR 0005):** a pending entry, tagged with the
  operation's own client-generated id, appears immediately and is replaced by
  the real document once its broadcast arrives, or removed if the server
  rejects it. A pending roll never guesses a number -- its placeholder is
  just "Rolling `<expression>`…" -- since the server rolls, never the client.
  **Built.** Verified against a real running server, not just the test
  suite: two independent `socket.io-client` connections, one claims a seat,
  sends a message and a `/roll`, the other receives both live with a real
  evaluated `RollResult`, and a REST history fetch afterward agrees, in order.
- **Characters and the party** (`stores/documents.ts`, `api/documents.ts`) --
  the store the sheet and party bar read. Actors and the party load over REST
  (with the device token, so the server filters by what this seat may read) and
  stay live from broadcasts, including deletions (`Broadcast.deleted`). It
  holds only *server-confirmed* documents plus a list of this client's pending
  edits; what the UI reads is the confirmed document with the pending
  `actor.update` changes applied on top, so an edit shows instantly, a
  confirming broadcast replaces it, and a rejection just drops it (rollback with
  nothing to undo by hand, ADR 0005). Only `actor.update` is optimistic;
  operations whose result is server logic (items, conditions, rolls) go through
  `send`. A reconnect reloads, so a broadcast missed offline cannot leave it
  stale. No screen uses it yet. **Built.**
- **The table** (`components/TableView.vue`) -- what a seated player sees,
  shown by the lobby while this device holds a seat (the seat list folds into a
  "Seats" disclosure, still there for a GM adding seats). Three landmarks, each
  with a skip link: the **party bar** (members in party order; the full bar with
  portraits, HP and conditions is a later PR), the **character pane** (the
  characters this seat can see, a "new character" form that opens the character
  when it arrives, and the sheet itself in a later PR), and the **chat**. Chat
  sits beside the sheet from 900px and stacks below that, so it works at an
  iPad's 1024px; there is no phone layout (CLAUDE.md, Targets and budgets).
  **Built.**
- **The canvas** — PixiJS scene rendering, tokens, grid, and movement. Major
  version pinned; upgrading it is its own reviewed PR. Not yet
- **Sheets, the party bar, and the action bar**. Not yet
- **Tooltips and the encyclopedia** — the "hover to learn" system. Not yet
- **Modifier breakdowns** — rendered from the `Statistic` that computed the
  number, never recomputed (`docs/adr/0008-modifier-resolution.md`). Not yet

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
