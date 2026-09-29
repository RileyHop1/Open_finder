# @hearthtable/server

Fastify + Socket.IO. The authoritative half of the application: it validates
every change, persists it, and tells everyone else.

## What lives here
- **The world store** (`worldStore.ts`, `paths.ts`) — one `node:sqlite`
  database per world, the on-disk folder layout from CLAUDE.md, transactions,
  the operation log, and generic document read/write. Deliberately small and
  boring: it's the one place that imports `node:sqlite` directly, so it's the
  whole swap point if that still-experimental API changes. See
  `docs/adr/0002-storage-sqlite.md` and `docs/adr/0009-node-sqlite.md`.
  **Built.**
- **Operation dispatch** — validate against the Zod schema, check the seat's
  permission, apply inside a transaction, assign a sequence number, broadcast
  (`docs/adr/0005-concurrency.md`). Not yet — the world store's `transaction`
  and `appendOperation` exist for this to be built on top of
- **Migrations** — the forward-only runner, executed on world open. Not yet
  — the world store's `meta` table exists for this to read/write its version
  marker
- **Seats** — seat selection and device tokens; there is no authentication
  (`docs/adr/0007-seats-not-accounts.md`). Not yet
- **Snapshots and world export/import.** Not yet — the `snapshots/` folder is
  already created per world by the world store

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
