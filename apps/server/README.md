# @hearthtable/server

Fastify + Socket.IO. The authoritative half of the application: it validates
every change, persists it, and tells everyone else.

## What lives here
- **Operation dispatch** — validate against the Zod schema, check the seat's
  permission, apply inside a transaction, assign a sequence number, broadcast
  (`docs/adr/0005-concurrency.md`)
- **Persistence** — SQLite via `better-sqlite3`, one database file per world
  (`docs/adr/0002-storage-sqlite.md`)
- **Migrations** — the forward-only runner, executed on world open
- **Seats** — seat selection and device tokens; there is no authentication
  (`docs/adr/0007-seats-not-accounts.md`)
- **Snapshots and world export/import**

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
