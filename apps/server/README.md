# @hearthtable/server

Fastify + Socket.IO. The authoritative half of the application: it validates
every change, persists it, and tells everyone else.

## Running it

```bash
pnpm --filter @hearthtable/server dev
```

Binds to `127.0.0.1:3000` by default. Override with `HEARTHTABLE_HOST`,
`HEARTHTABLE_PORT`, `HEARTHTABLE_WORLDS_ROOT`, and `HEARTHTABLE_STATIC_DIR`
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
  /api/worlds/:id/seats` for a GM to create and list seats. Serves a built
  client's static files from `staticDir` if one is configured and exists;
  there is nothing to serve yet, since `apps/client` has no build. **Built.**
- **`withWorldStore`** (`worldAccess.ts`) — resolves the `WorldStore` for a
  world id, reusing the active world's already-open connection when it
  matches rather than opening a second one to the same file. Shared by the
  seat routes above and, from the next PR, the realtime dispatch pipeline.
  **Built.**
- **Operation dispatch** — validate against the Zod schema, check the seat's
  permission, apply inside a transaction, assign a sequence number, broadcast
  (`docs/adr/0005-concurrency.md`). Not yet — the world store's `transaction`,
  `appendOperation`, and seat methods below exist for this to be built on
  top of
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
  `seat.release`, device tokens, GM PIN checking) are not yet — see
  `docs/adr/0007-seats-not-accounts.md`
- **Snapshots and world export/import.** Snapshotting exists (see
  Migrations above); world export/import is not yet built

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
