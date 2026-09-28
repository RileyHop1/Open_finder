# @hearthtable/core

The document model. Every piece of data in a world is a Document, and this
package defines what that means: the Zod schemas, the inferred types, the
permission model, and the operation shapes the server validates against.

## What lives here
- **The document envelope** (`document.ts`) — the shared shape every content
  document extends: `id`, `worldId`, `type`, `schemaVersion`, `permissions`,
  timestamps. See `docs/documents.md`. **Built.**
- **Document schemas** — `Actor`, `Item`, `Party`, `JournalEntry`, `Scene`,
  `Combat`, `ChatMessage`, `Calendar`, `RollTable`, each extending the
  envelope above. Not yet — these land through milestones 3–9 as each type's
  own feature needs it
- **`World` and `Seat`** — the two schemas that do *not* extend the document
  envelope. Next PR
- **Operations** — the client-to-server vocabulary (see
  `docs/adr/0005-concurrency.md`) and permission resolution `(seat, document)
  => level`. Not yet
- **`Modifier` and `Statistic`** — the modifier resolution types from
  `docs/adr/0008-modifier-resolution.md`. Not yet
- **The migration runner** that acts on `schemaVersion`. Not yet — the field
  exists on every document already, since retrofitting it later is the
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
