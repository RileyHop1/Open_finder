# World and Seat

Two schemas from `@hearthtable/core` that are **not** documents: `World` and
`Seat`. Both extend the shared `baseRecordSchema` (id, schemaVersion,
timestamps — see `docs/documents.md`'s "Why ISO strings" for the reasoning
behind that trio), but neither extends `baseDocumentSchema`. Neither has a
`worldId` referencing some other world, and neither carries the
none/limited/observer/owner permission scale a document does.

## World

The top-level container. One world is one campaign, one folder on disk
(`worlds/<id>/`, per CLAUDE.md's World folder layout), one SQLite database.
`worldSchema` mirrors that folder's `world.json`.

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `schemaVersion`, `createdAt`, `updatedAt` | — | The shared record trio |
| `name` | non-empty string | |

**A World has no `worldId`** — it cannot belong to itself — **and no
`permissions`** — access to what's inside a world is about what a *seat* can
do to a *document*, not about the world record itself.

### The active world is not part of this schema

Which world the server is currently serving to connecting clients is **server
runtime state**, decided by the GM (per the milestone 1 user story: "GM opens
the app and sees their campaigns, picks one, it's live"), not a field stored
on any `World` record. A server tracks at most one active world at a time and
that fact lives in memory / process state, not in `world.json` or the
database. This keeps world records themselves free of state that's really
about the *server's* current behavior.

## Seat

One of the "characters" a person can claim in a world's lobby. There is no
authentication and no account (ADR 0007, "Seats, not accounts") — picking a
seat *is* how a connecting client becomes someone, the way claiming a
controller works in couch co-op.

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `schemaVersion`, `createdAt`, `updatedAt` | — | The shared record trio |
| `worldId` | UUID | Which world this seat belongs to |
| `name` | non-empty string | What the lobby shows — labeled "character" in the UI even though the schema says `Seat` |
| `isGM` | boolean | Required; there is no default for who the GM is |
| `pin` | short string, optional | See "Not a secret" below |
| `claimedByDeviceToken` | string, optional | Set on first claim; absent until then |

### Not a secret

`pin` exists to stop a player from claiming the GM seat by accident out of
curiosity, per ADR 0007. It is not hashed, not rate-limited, and not meant to
resist a motivated guess. If the project ever needs real access control on a
seat, that's a new decision recorded as its own ADR — not an "improvement" to
this field, which would misrepresent what it actually does to anyone reading
the code later.

### Claiming and releasing

`claimedByDeviceToken` is how a returning browser gets back to the same seat
automatically (ADR 0007) — it's absent on an unclaimed seat, set to a device
token on claim, and cleared on release. The `seat.claim`/`seat.release`
operations (`packages/core`'s `operation.ts` for the schemas, `apps/server`'s
`realtime.ts` for the handlers) read and write this field: claiming checks
the target seat's `pin` when it has one, auto-releases any other seat the
same device token already holds, and a fresh connection presenting a known
device token gets `claimedByDeviceToken` looked up and restored to
`socket.data.seatId` automatically — see `docs/operations.md`.

### Storage and creation

Seats get their own table (`seats`, added by a migration — see
`docs/adr/0002-storage-sqlite.md`'s "Migrations" note and
`apps/server/src/migrations.ts`), not the generic `documents` table:
`baseDocumentSchema` doesn't apply here (a `Seat` has no `type` or
`permissions`), so there's nothing for the generic table's columns to hold.
`WorldStore` exposes `putSeat` (insert-or-update), `getSeat`, `listSeats`,
and `getSeatByDeviceToken` (for reconnect auto-rejoin) directly against it.

A GM creates seats via REST, the same open-mutate-close pattern
`POST /api/worlds` already uses for creating a world:

```
POST /api/worlds/:id/seats   { name, isGM, pin? }  →  201, the created Seat
GET  /api/worlds/:id/seats                          →  200, every seat in that world
```

Both return the full `Seat` object, `pin` included, deliberately not
redacted — see the comment above these routes in `app.ts` for why adding
selective redaction here would be exactly the security theater `pin`'s own
"not a secret" framing warns against.

## Why not one shared schema for both?

`World` and `Seat` share the record trio but nothing else — a World has no
`worldId` or `isGM`, a Seat has no `name`-as-campaign-title concept. Forcing
them under one schema to save a few lines would produce a type with fields
that don't apply to half its uses, which is worse than the small duplication
of each independently extending `baseRecordSchema`.

## Testing

Schema-level: `packages/core/src/world.test.ts` and
`packages/core/src/seat.test.ts`. Both confirm the negative space explicitly
— that `worldId` and `permissions` are genuinely absent from a parsed
`World`, and that `permissions` is genuinely absent from a parsed `Seat` —
not just that the fields each schema does have validate correctly.

Storage-level: `apps/server/src/worldStore.test.ts`'s `seats` block (round-trip,
upsert, `getSeatByDeviceToken`, persistence across close/reopen) and
`apps/server/src/app.test.ts`'s seat route tests, including one that
specifically exercises `withWorldStore`'s reuse-the-active-connection path
rather than only the open-a-fresh-one path every other test takes.
