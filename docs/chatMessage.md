# ChatMessage

The first concrete document type — see [documents.md](documents.md) for the
shared envelope this extends (`id`, `worldId`, `type`, `schemaVersion`,
`permissions`, timestamps). Built in milestone 1 because "chat with a dice
roll" is the thin thread's proof of the whole pipeline: schema → SQLite →
operation → sequence → broadcast.

## Two variants under `kind`

A plain text message and a dice roll are different enough shapes — a roll has
no free text, a message has no `RollResult` — that one schema trying to cover
both would make neither variant's actual requirements checkable. `kind` is the
discriminant between them, separate from `type`, which every `ChatMessage`
already fixes to the literal `'chatMessage'` (that's what makes it a
`ChatMessage` at the envelope level; `kind` says which kind of one).

| Field | Type | Notes |
| --- | --- | --- |
| `seatId` | UUID | The seat that sent this message. **Required, not optional** — a connection can't send a `chat.*` operation at all until it has claimed a seat (see [operations.md](operations.md)), so a ChatMessage with no sender isn't a state that can arise |
| `kind` | `'text' \| 'roll'` | Discriminant |
| `text` | non-empty string | Only on `kind: 'text'` |
| `roll` | `RollResult` | Only on `kind: 'roll'` — see below |

## The `roll` variant stores structure, never a string

Per CLAUDE.md's ChatMessage rule: **stores structured roll data, never a
rendered string.** The hoverable combat-log breakdowns in the north star are a
view over that structure (milestone 6); a message persisted as `"Riley rolled
17"` could never be un-flattened back into it.

`roll` mirrors `@hearthtable/dice`'s own `RollResult` type field for field —
see [dice.md](dice.md), "Return shape":

```ts
{
  expression: string;
  total: number;
  terms: RollTerm[];
  degree?: DegreeOfSuccess;  // present for a check rolled against a DC
  natural?: number;          // the d20 face, for the nat-20/nat-1 rule
  damage?: DamageByType;     // present for damage rolls
  seed?: string;             // test builds only
}
```

`packages/core`'s schemas for this (`rollTermSchema`, `degreeOfSuccessSchema`,
`damageByTypeSchema`, `rollResultSchema` in `chatMessage.ts`) import
`@hearthtable/dice`'s own types and its `DEGREES_OF_SUCCESS` list rather than
re-declaring them, so the two packages' definitions cannot silently drift
apart. They import from that package's `/pure` entry point specifically, not
its root — see `packages/dice`'s README: the root also exports
`cryptoRandomSource`, which needs `node:crypto`, and `packages/core` is
isomorphic (shared with `apps/client`) and must never require Node's types to
typecheck.

Composing `degree`/`natural`/`damage` onto a base `RollResult` isn't
`@hearthtable/dice`'s job — `evaluate()` returns only
`{ expression, total, terms, seed? }`. `apps/server`'s `chat.sendRoll` handler
(`realtime.ts`) calls `evaluate()` this way today; this milestone's operation
has no DC in its payload (see [operations.md](operations.md)), so it never
sets `degree`/`natural` — a future check-rolling caller that has a DC to
compare against would call `degreeOfSuccess()` too and compose it onto its
own `RollResult`, the same way a damage-rolling caller would use
`evaluateDamage()` (which does return `damage` already populated).

## Why `seatId` is required here but optional on `AppliedOperation`

`AppliedOperation.seatId` is optional because `seat.claim` itself — the
operation that establishes a connection's identity — has no seat to attribute
itself to yet (see [operations.md](operations.md)). By the time a `chat.*`
operation can be sent at all, the dispatching connection already holds a seat,
so the `ChatMessage` document it produces always has one. The two fields look
similar but describe different moments.

## Reading history

New messages arrive live over the realtime `broadcast` event, but a client
that just connected needs the ones that already exist. That's `GET
/api/worlds/:id/documents?type=chatMessage` (`apps/server`'s generic,
type-agnostic document-listing route — it has no idea what a `ChatMessage`
is, so it returns raw stored JSON, oldest-created first), which a caller
validates against `chatMessageSchema` itself, the same way it would validate
a `Broadcast`'s own loosely-typed `documents` array.

**Not** the `sync` event / operation log replay: a `chat.sendRoll`
operation's payload is the raw expression text a player typed, not the
evaluated `RollResult` — replaying it would call `@hearthtable/dice` again
and roll different numbers than what actually happened. History has to come
from what was actually stored, not from re-deriving it.

## Example

```ts
import { chatMessageSchema } from '@hearthtable/core';

chatMessageSchema.parse({
  id: crypto.randomUUID(),
  worldId: crypto.randomUUID(),
  type: 'chatMessage',
  schemaVersion: 1,
  permissions: { default: 'observer' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  seatId: crypto.randomUUID(),
  kind: 'roll',
  roll: { expression: '1d20+7', total: 19, terms: [/* ... */] },
});
```

## Testing

See `packages/core/src/chatMessage.test.ts`. Covers both variants'
requirements, that the union discriminates on `kind` and not `type`, that a
parsed message of one variant has no leftover key from the other, and —
distinct from a schema-shape test — that `rollResultSchema` actually validates
**real** `@hearthtable/dice` output: a plain roll, a roll with a seed, a
simulated check roll with `degree`/`natural` set, a real damage roll via
`evaluateDamage()`, and a roll with a dropped die, proving the mirrored schema
matches that package's real behavior rather than a hand-shaped fixture that
merely looks right.
