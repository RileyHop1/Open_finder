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
  "Seats" disclosure, still there for a GM adding seats). **Map-first** since
  milestone 4: four landmarks, each with a skip link. The **party bar** is on top;
  the **map** fills the middle (an empty state until a scene is showing); the
  **character pane** is a drawer that slides over the map's left edge (the
  characters this seat can see, a "new character" form that opens the character
  when it arrives, and the sheet itself); and the **chat** is on the right. The
  drawer opens from the "Characters" button, a party card, or its skip link, and
  Escape or "Close" shuts it and returns focus to what opened it. It overlays
  the map rather than pushing it, so the map never reflows while someone reads
  their sheet. Chat sits beside the map from 900px and stacks below that, so it
  works at an iPad's 1024px; there is no phone layout (CLAUDE.md, Targets and
  budgets).
  **Built.**
- **The character sheet, read-only** (`components/sheet/CharacterSheet.vue`) --
  header (name, level, lineage, HP against the derived maximum, conditions),
  attributes, defenses (AC, saves, Perception, class DC) and every skill with
  its rank written out. Every number is `prepareCharacter` run in the browser,
  the same function the server rolls with, so the sheet and a roll cannot
  disagree. The test asserts hand-computed totals, and a timing test holds a
  level 20 character with 80 items to the 200ms sheet budget. **Edit mode**
  (owner or GM; the server enforces it too) turns the stored values into labelled
  inputs in place -- name, level, ancestry/heritage/background/class, key
  attribute, hit points, the six attributes, every rank (save, Perception, class
  DC, weapon and armor categories, each skill) and a way to add Lore skills --
  and the totals recompute as you type. Each field saves when committed (Enter or
  leaving it, never per keystroke), as one optimistic `actor.update` of dotted
  paths. Inputs are native, labelled controls, so it is keyboard-operable with no
  extra work. Direct entry of HP and every rank is the GM's override path.
  **Built.** "Fill ranks from class" needs a class entry from the compendium, so
  it arrives with the compendium picker.
- **Items and the compendium picker** (`components/sheet/InventoryPanel.vue`,
  `api/compendium.ts`) -- under the sheet: what the character carries, with kind,
  equipped state, and quantity. An owner or the GM can equip, change quantity,
  remove, and open "Add an item from the compendium": a labelled search by name
  and kind over the server's read-only compendium. Adding sends only the pack
  and slug; the server makes the copy (ADR 0015), so a client cannot invent an
  item. An item whose rules we could not automate carries a visible "Automation
  not applied" flag with the count of effects to apply by hand (ADR 0004). With
  nothing imported yet the picker says so instead of showing an empty list.
  Item changes are not optimistic: they appear when the server's broadcast
  returns. **Built**, against fixtures: no real import has been run through it.
- **Roll cards in chat** (`components/ChatRollCard.vue`) -- a sheet check, a
  strike's attack, and its damage render as a card: who rolled what, the total
  against the DC with the degree written out ("Success", "Critical failure"),
  the natural d20, damage by type, and a "Breakdown" disclosure listing the dice
  and every modifier. A modifier that did not count is struck through *and* says
  why in words ("not applied: Bless is better"); a Multiple Attack Penalty shows
  as its own line. The card reads the statistic stored in the message, so the
  breakdown is exactly what was rolled. The hover version is milestone 6.
  **Built.**
- **Roll buttons and strikes** (`CharacterSheet.vue`, `components/sheet/StrikesPanel.vue`)
  -- an owner or the GM gets a Roll button on Perception, each save, and every
  skill, and a "DC to roll against (optional)" box that applies to the next roll
  (empty means no DC, so no degree). The strikes panel lists each equipped
  weapon with three attack buttons -- 1st, 2nd, 3rd, each showing its bonus with
  the Multiple Attack Penalty already in it -- plus Damage and Critical damage,
  and the dice they will roll (a `deadly` die shows on the critical line before
  it is rolled). The player picks which attack of the turn it is by which button
  they press, because the server cannot count a turn's attacks until the combat
  tracker (milestone 5). Every roll is made by the server; the card appears in
  chat. AC and the class DC have no roll button, since others roll against
  them. **No unarmed strike** yet (the empty state says so). **Built.**
- **Conditions** (`components/sheet/ConditionsPanel.vue`) -- each condition named in
  words with its value ("Frightened 2"), so nothing relies on colour or an icon
  alone. An owner or the GM can add one (the ordinary way: a second source of a
  valued condition keeps the higher value, never the sum), set a valued condition
  to an exact value (the manual override; 0 removes it), or remove it. Names to
  pick from are the imported condition definitions; with none imported yet it
  falls back to typing a name, as the server accepts any well-formed one until
  definitions exist (`docs/conditions.md`). Not optimistic: the merge and the
  clearing of superseded conditions are server logic, so the change appears when
  the broadcast returns, and the sheet's numbers move with it. **Built.**
- **Hit points** (`components/sheet/HitPointsPanel.vue`) -- current over derived
  maximum, temporary points, and "at 0 hit points" in words. An owner or the GM
  types an amount and presses Damage, Heal, or Temp HP; the arithmetic is
  `applyDamage` / `applyHealing` / `grantTemporaryHitPoints` in `systems/pf2e`
  (temporary points soak damage first, healing stops at the maximum, temporary
  points keep the larger amount rather than adding). The result goes out as one
  optimistic `actor.update` of only the fields that changed. Setting a value
  directly is the GM override, in the sheet's edit mode. Going unconscious or
  dying at 0 is the combat tracker's (milestone 5). **Built.**
- **The party bar** (`components/PartyBar.vue`) -- one card per party member in
  party order: a portrait (the uploaded image when there is one, otherwise their
  initial in a circle; decorative, since the name is printed beside it), the
  name, hit points as a bar *and* as numbers ("12 / 20 (+5 temp) · at 0"), and
  condition badges that are their name and value, three at most with the rest
  folded into "+N more". The whole card is one button, so click, tap, Enter, and
  Space open that member's sheet, and it is at least 44px tall. Numbers come from
  `prepareCharacter`, so the bar and the sheet cannot disagree. An NPC member
  shows by name alone. **Managing the party** (`components/PartyManager.vue`) is the GM's "Manage
  party" disclosure under the bar, shown to the GM only (the server refuses anyone
  else too): Move up / Move down / Remove per member, and an "Add to party" picker
  of the characters and NPCs not yet in it. Reordering is buttons, never drag
  alone, and each change is announced in a status line so it is heard as well as
  seen. It sends `party.addMember`, `party.removeMember`, and `party.reorder`, and
  the bar changes when the broadcast returns. **Built.**
- **Portraits** (`components/sheet/PortraitPicker.vue`, `api/assets.ts`) -- the
  image (or the initial placeholder) at the top of the sheet. An owner or the GM
  gets a labelled file input restricted to PNG, JPEG, WebP, and GIF, and a
  Remove button. A file of another type is refused in words before anything is
  sent; otherwise the raw file is posted to `apps/server`'s asset route
  (`docs/assets.md`), then the actor's `portrait` is set to the stored name with
  an optimistic `actor.update`, and the party bar shows it. If the server
  refuses the file (it checks the contents, not just the label), its reason is
  shown beside the picker and nothing changes. **Built.**
- **The content import button** (`components/ContentImportPanel.vue`,
  `api/contentImport.ts`) — the GM's "Import game content". On a table with
  nothing imported it is the first thing on the GM's screen, in plain words (what
  it is, that nothing is uploaded, that it needs internet); it shows the seconds
  while it runs, explains a failure in a sentence with the detail behind a
  disclosure, and folds to "Game content: N entries loaded" once done. The item
  and condition pickers look again after it finishes. See
  `docs/content-import.md`. **Built.**
- **The map canvas** (`components/map/MapCanvas.vue`) — owns one PixiJS
  `Application`: mounts its canvas, keeps it the size of its box, and destroys it
  (and the WebGL context) on unmount. It is loaded with a dynamic import, so
  PixiJS is its own chunk, fetched only when a map is first shown. A browser
  without WebGL2 (or where PixiJS cannot start) gets a plain-language message
  instead of a blank box. PixiJS is pinned to an exact version (`8.21.0`);
  upgrading it is its own reviewed PR. **Built, not on screen yet:** the map,
  grid, tokens, and movement are the next PRs of milestone 4
  (`docs/adr/0017-scenes-and-tokens.md`).
- **The action bar** (strikes, spells, and actions as hotbar icons). Not yet
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
