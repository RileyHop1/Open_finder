# @hearthtable/server

Fastify + Socket.IO. The authoritative half of the application: it validates
every change, persists it, and tells everyone else.

## Running it

```bash
pnpm --filter @hearthtable/server dev
```

Binds to `127.0.0.1:3000` by default. Override with `HEARTHTABLE_HOST`,
`HEARTHTABLE_PORT`, `HEARTHTABLE_WORLDS_ROOT`, `HEARTHTABLE_STATIC_DIR`, and
`HEARTHTABLE_COMPENDIUM_DIR`
(env vars; see `index.ts`). Setting `HEARTHTABLE_HOST` to `0.0.0.0` or `::` is
refused outright — see Deployment notes below.

## What lives here
- **The world store** (`worldStore.ts`, `paths.ts`) — one `node:sqlite`
  database per world, the on-disk folder layout from CLAUDE.md, transactions,
  the operation log, and generic document read/write. Deliberately small and
  boring: it's the one place that imports `node:sqlite` directly, so it's the
  whole swap point if that still-experimental API changes. See
  `docs/adr/0002-storage-sqlite.md` and `docs/adr/0009-node-sqlite.md`.
  **Built.**
- **The HTTP API** (`app.ts`, `activeWorld.ts`, `worldAccess.ts`) — Fastify.
  `GET`/`POST /api/worlds` to list and create, `POST /api/worlds/:id/activate`
  and `GET /api/worlds/active` for the single active world (server runtime
  state, never persisted — see `docs/world-and-seats.md`), `POST`/`GET
  /api/worlds/:id/seats` for a GM to create and list seats, and `GET
  /api/worlds/:id/documents` (optional `?type=` filter) for reading back
  whatever's in the generic documents table, oldest-created first — the
  client's chat history fetch is the first real caller. Generic on purpose,
  the same way `WorldStore.listDocuments` itself is: this route returns raw
  stored JSON rather than validating against any one concrete schema, since
  it doesn't know which one applies. Serves a built client's static files
  from `staticDir` if one is configured and exists. **Built.**
- **`withWorldStore`** (`worldAccess.ts`) — resolves the `WorldStore` for a
  world id, reusing the active world's already-open connection when it
  matches rather than opening a second one to the same file. Used by the seat
  and document routes above. The realtime layer doesn't need it: every
  operation dispatches against whatever world is currently active, never an
  arbitrary world id, so it just calls `activeWorld.get()` directly. **Built.**
- **Realtime dispatch** (`realtime.ts`) — Socket.IO, attached directly to
  the app's underlying HTTP server (no extra Fastify plugin). The full
  ADR 0005 pipeline: validate the incoming message against
  `clientOperationUnionSchema`, apply whatever check that operation type
  needs, apply it inside a transaction, assign a sequence number, broadcast
  to every connected client — there's only ever one active world for the
  whole server, so there are no Socket.IO rooms. A connection must present a
  `deviceToken` in its handshake `auth` or it's refused outright; on
  connection it auto-rejoins whatever seat that device token already holds
  (`getSeatByDeviceToken`). Ships with `seat.claim` (auto-releasing any other
  seat the same device token holds, and checking a GM seat's pin per
  ADR 0007), `seat.release`, and now `chat.sendMessage`/`chat.sendRoll` —
  the latter parses and evaluates the roll expression server-side with
  `@hearthtable/dice` (never trusting a client-computed result), storing the
  structured `RollResult` as a `ChatMessage` document via `putDocument`, never
  a rendered string. A malformed expression or an unresolved `@reference` is
  rejected with the parser's/evaluator's own message. Both chat operations
  require the sending connection to already hold a seat, same as every
  operation that isn't `seat.claim`/`seat.release` themselves. A `sync` event
  replays every operation after a given sequence, for
  reconnect — no gap-size limit yet; there's no log pruning to make "gap too
  large" a real case yet either. When the GM activates a different world,
  every connected socket is disconnected so clients reconnect against the
  new world's context. **Built.** Tested with a real listening server and a
  real `socket.io-client` (`realtime.test.ts`) — Fastify's `.inject()` can't
  drive WebSockets.
- **Characters, items, conditions, and the party** (`actors.ts`, `items.ts`,
  `conditions.ts`, `party.ts`, `patch` from core) — the milestone 3 operations.
  Each goes through one write guard (`writeGuard.ts`: a document you cannot
  read is reported as not found, changing needs `owner`, the GM always owns)
  and one `editCharacter` path that re-validates the whole sheet before
  storing, so a client can never persist a malformed one. `actor.addItem`
  copies from the server's own compendium; a client cannot supply item
  content. `actor.update` is a per-field dotted-path patch with an allow-list.
  The party is the GM's, created on first use. See `docs/operations.md`.
  **Built.**
- **Sheet rolls** (`checks.ts`, `strikeRolls.ts`) — `actor.rollCheck`,
  `actor.rollStrike`, and `actor.rollDamage`: the server prepares the character
  with `prepareCharacter`, rolls, and stores a structured chat message with the
  statistic it rolled. See `docs/chatMessage.md`. **Built.**
- **What each seat receives** (`visibility.ts`) — broadcasts, sync replay, and
  the documents route are filtered per seat (`none` and `limited` are
  withheld), and a deletion travels as a bare tombstone. **Built.**
- **The compendium** (`compendium.ts`, routes in `app.ts`) — the imported packs
  loaded into memory at startup and served read-only: `GET /api/compendium`,
  `/search`, and `/:packId/:slug` (ADR 0015). Starts empty and works without
  an import. `HEARTHTABLE_COMPENDIUM_DIR` overrides where it loads from.
  **Built**, against fixtures: never run against a real import.
- **The in-app content import** (`contentImport.ts`, routes in `app.ts`) —
  `POST /api/compendium/import` (GM only) runs the importer as a child process
  and reloads the compendium without a restart; `GET` reports the state. See
  `docs/content-import.md` and ADR 0016. **Built**, and run once end to end
  against a live server.
- **Image assets** (`assets.ts`, routes in `app.ts`) — `POST
  /api/worlds/:id/assets` streams an image to `assets/<hash>.<ext>` after
  checking its first bytes; `GET` serves it. See `docs/assets.md`. **Built.**
- **Migrations** (`migrations.ts`) — the forward-only runner, run
  automatically whenever a world's database is opened; snapshots (via
  `db.serialize()`, never a raw file copy — see the module's own doc comment
  for why) before every individual migration, not once per batch. Currently
  migrates the database's own table structure; no concrete document type
  exists yet to need per-type body migrations. **Built.**
- **The shared transaction helper** (`transaction.ts`) — `node:sqlite` has
  no `db.transaction()` the way `better-sqlite3` did; this is that missing
  primitive, used by both the world store and the migration runner. **Built.**
- **Seat storage** (`worldStore.ts`'s `putSeat`/`getSeat`/`listSeats`/
  `getSeatByDeviceToken`) — the seats table has its own storage methods now,
  a `Seat` doesn't extend the document envelope so it can't reuse the generic
  document ones. **Built.** Seat selection *operations* (`seat.claim`/
  `seat.release`, device tokens, GM PIN checking) are also **built** — see
  `realtime.ts` above and `docs/adr/0007-seats-not-accounts.md`
- **Snapshots** exist (see Migrations above).
- **World export/import** (`worldArchive.ts`, wired up in `app.ts`) —
  `GET /api/worlds/:id/export` streams a download; `POST /api/worlds/import`
  restores one. The archive itself is a small, custom, streamed container
  (not tar/zip) holding `world.json`, `WorldStore.serialize()`'s bytes as
  `world.db`, and every file under `assets/`. Neither direction buffers an
  asset's content beyond one underlying chunk, so this holds regardless of
  how large or how many assets a campaign has — the Fastify body limit is
  raised well past its 1 MiB default for exactly this reason, and the
  import route registers a streaming content-type parser so the upload is
  never buffered either. Preserves the archived world's own id on import
  (its `world.db` rows already point at it) and refuses rather than
  overwrites if that id already exists at the destination. **Built.**
  Verified against two real, separate server processes (two different
  `HEARTHTABLE_WORLDS_ROOT`s, standing in for "another machine"): exported a
  world with a seat and a 3 MiB fake asset from one, imported it into the
  other, and confirmed the world, the seat, and the asset's own SHA-256 all
  survived the round trip

## Deployment notes
- **Binds to localhost by default, never `0.0.0.0`.** This app is served on a
  trusted network — a LAN, or a mesh VPN such as ZeroTier or Tailscale. It must
  not be port-forwarded to the open internet.
- Runs as a single Node process. A Docker image is a convenience, not a
  requirement.
- **Single writer per world.** The SQLite choice and the concurrency model
  assume one process; a multi-process deployment breaks both.

## How it fits
Depends on `@hearthtable/core`, `@hearthtable/dice`, and `@hearthtable/pf2e`.
The client never writes to the database and never rolls dice.
