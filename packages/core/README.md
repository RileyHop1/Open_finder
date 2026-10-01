# @hearthtable/core

The document model. Every piece of data in a world is a Document, and this
package defines what that means: the Zod schemas, the inferred types, the
permission model, and the operation shapes the server validates against.

## What lives here
- **The shared record base** (`record.ts`) — `id`, `schemaVersion`,
  `createdAt`, `updatedAt`. Everything persisted extends this. **Built.**
- **The document envelope** (`document.ts`) — extends the record base with
  what makes a document specifically a *document*: `worldId`, `type`,
  `permissions`. See `docs/documents.md`. **Built.**
- **`World` and `Seat`** (`world.ts`, `seat.ts`) — extend the record base
  directly, not the document envelope; neither is permission-gated the way a
  document is. See `docs/world-and-seats.md`. **Built.**
- **`ChatMessage`** (`chatMessage.ts`) — the first concrete document schema,
  extending the document envelope. Two variants under a `kind` field: a plain
  text message and a dice roll, the latter mirroring `@hearthtable/dice`'s own
  `RollResult` field for field (imported from that package's `/pure` entry
  point — see its README — so this package's own isomorphic typecheck never
  needs Node's types). **Built.**
- **`Actor` and `Party`** (`actor.ts`, `party.ts`) — a system-agnostic
  actor whose `system` payload `systems/pf2e` validates, and the ordered
  adventuring group. See `docs/actor.md` and `docs/party.md`. **Built.**
- **Other document schemas** — `Item`, `JournalEntry`, `Scene`, `Combat`,
  `Calendar`, `RollTable`, each extending the document envelope. Not yet —
  these land through milestones 4–9 as each type's own feature needs it
- **Operations** (`operation.ts`) — the client-to-server vocabulary: the
  `ClientOperation`/`AppliedOperation` envelopes, the broadcast shape, and
  the seat and chat operations milestone 1 needs, and milestone 3's actor,
  item, condition, party, and roll operations (`docs/operations.md` has the
  table). See `docs/operations.md` and
  `docs/adr/0005-concurrency.md`. **Built** — grows per slice as later
  milestones add operations
- **Permission resolution** (`permission.ts`) — `resolvePermission(seat,
  document) => level`, and `canReadDocument` / `resolveViewerPermission`, which
  the server uses to filter what each seat receives. **Built.**
- **The dotted-path patch** (`patch.ts`) — `applyChanges`, which both the
  server and the client use to apply an `actor.update`, so an optimistic edit
  and the stored result cannot disagree. **Built.**
- **`Modifier` and `Statistic`** (`modifier.ts`, `resolveStatistic.ts`) — the
  modifier resolution types and the stacking resolver from
  `docs/adr/0008-modifier-resolution.md`. **Built.**
- **The migration runner** that acts on `schemaVersion` lives in
  `apps/server` (`migrations.ts`), not here; this package only defines the
  field every record carries.

Types are always *inferred from* the Zod schema, never written twice.

## How it fits
This package is **system-agnostic**. It knows what a Document is; it does not
know what a Strike is or how Pathfinder computes AC. That lives in
`@hearthtable/pf2e`.

**`core` must never import `@hearthtable/pf2e`.** The dependency runs one way
only, and that boundary is the whole reason the project is a monorepo rather
than one package — see `docs/adr/0001-stack.md`. It is enforced by simply not
declaring the dependency, so an import will fail to resolve.

Imported by: `@hearthtable/pf2e`, `@hearthtable/server`, `@hearthtable/client`.
