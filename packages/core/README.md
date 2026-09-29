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
- **Other document schemas** — `Actor`, `Item`, `Party`, `JournalEntry`,
  `Scene`, `Combat`, `Calendar`, `RollTable`, each extending the document
  envelope. Not yet — these land through milestones 3–9 as each type's own
  feature needs it
- **Operations** (`operation.ts`) — the client-to-server vocabulary: the
  `ClientOperation`/`AppliedOperation` envelopes, the broadcast shape, and
  the four operations milestone 1 needs (`seat.claim`, `seat.release`,
  `chat.sendMessage`, `chat.sendRoll`). See `docs/operations.md` and
  `docs/adr/0005-concurrency.md`. **Built** — grows per slice as later
  milestones add operations
- **Permission resolution** (`permission.ts`) — `resolvePermission(seat,
  document) => level`. **Built.**
- **`Modifier` and `Statistic`** — the modifier resolution types from
  `docs/adr/0008-modifier-resolution.md`. Not yet
- **The migration runner** that acts on `schemaVersion`. Not yet — the field
  exists on every record already, since retrofitting it later is the
  expensive mistake

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
