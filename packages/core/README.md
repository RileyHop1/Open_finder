# @hearthtable/core

The document model. Every piece of data in a world is a Document, and this
package defines what that means: the Zod schemas, the inferred types, the
permission model, and the operation shapes the server validates against.

## What lives here
- **Document schemas** — `Actor`, `Item`, `Party`, `JournalEntry`, `Scene`,
  `Combat`, `ChatMessage`, `Calendar`, `RollTable`
- **Permissions** — the none / limited / observer / owner model, resolved
  against a seat
- **Operations** — the client-to-server vocabulary (see
  `docs/adr/0005-concurrency.md`)
- **`Modifier` and `Statistic`** — the modifier resolution types from
  `docs/adr/0008-modifier-resolution.md`
- **`schemaVersion` and migrations** — the forward-only migration runner

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
