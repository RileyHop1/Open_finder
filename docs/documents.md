# The document envelope

This page describes the shared envelope every content document carries —
`@hearthtable/core`'s `baseDocumentSchema`. It is not a page for one document
type; it's the shape `Actor`, `Item`, `Party`, `JournalEntry`, `Scene`,
`Combat`, `ChatMessage`, `Calendar`, and `RollTable` will each extend once they
exist. None of them do yet — see the Milestones section of
[CLAUDE.md](../CLAUDE.md) for when each lands. Each will get its own page here
once it's real, following the format below.

`World` and `Seat` do **not** extend this envelope. A `World` can't belong to
itself (no `worldId`), and a `Seat` isn't permission-gated the way a document
is — see [world-and-seats.md](world-and-seats.md).

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | `crypto.randomUUID()` — no library, works identically client and server |
| `worldId` | UUID | The world this document belongs to |
| `type` | non-empty string | Narrowed to a literal by each concrete document schema, e.g. `z.literal('party')` |
| `schemaVersion` | positive integer | Forward-only, starts at 1. See Data durability in CLAUDE.md |
| `permissions` | see below | |
| `createdAt`, `updatedAt` | ISO 8601 string | Not epoch numbers, not `Date` objects — see "Why ISO strings" below |

`id`, `schemaVersion`, `createdAt`, and `updatedAt` come from `baseRecordSchema`
— the same shared trio `World` and `Seat` extend (see
[world-and-seats.md](world-and-seats.md)). `worldId`, `type`, and `permissions`
are what `baseDocumentSchema` adds on top, specifically because those three are
what make a document a *document*.

## Permissions

Four levels, borrowed from Foundry's document permission model (CLAUDE.md's
Architecture section): `none`, `limited`, `observer`, `owner`.

```ts
{
  default: 'observer',        // required -- see "Why no default default" below
  seats: {
    '<seat-id>': 'owner',     // per-seat overrides; omitted seats get `default`
  },
}
```

This schema stores **what's on the document**, not what a given seat can
actually do with it. Resolving a seat's effective level — including "the GM
always resolves to `owner`, regardless of what's stored here" — is resolution
logic that reads this shape, not part of the shape itself. That resolver lands
in a later PR (`packages/core`'s operations work).

### Why no default `default`

The schema requires `default` to be set explicitly; it has no fallback value.
Different document types want different defaults — a `ChatMessage` is
plausibly `observer` by default (chat is public at the table), while a GM's
private journal note is plausibly `none` by default. Baking one assumption in
at the envelope level would make that choice silently for every future
document type instead of leaving each type's construction code to decide it on
purpose.

## Why ISO strings

Documents round-trip through JSON — SQLite JSON columns, the export archive —
where neither `Date` objects nor a distinguished date type exist natively. An
ISO 8601 string stays human-readable when someone opens the raw database file,
and it sorts correctly as a plain string (which an epoch-millisecond number
also does, but isn't human-readable, and a `Date` object is neither).

## Example

```ts
import { baseDocumentSchema } from '@hearthtable/core';
import { z } from 'zod';

// How a concrete document type will extend this, once one exists:
const partySchema = baseDocumentSchema.extend({
  type: z.literal('party'),
  memberIds: z.array(z.uuid()),
});

partySchema.parse({
  id: crypto.randomUUID(),
  worldId: crypto.randomUUID(),
  type: 'party',
  schemaVersion: 1,
  permissions: { default: 'observer' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  memberIds: [],
});
```

## Testing

See `packages/core/src/document.test.ts`. Covers every field's validation
boundary (malformed UUIDs, an out-of-scale permission level, a zero or
fractional `schemaVersion`, a malformed timestamp) and the extension pattern
shown above, proving it actually composes rather than just reading plausibly.
