# Actor

A PC, NPC, or hazard. `@hearthtable/core`'s `actorSchema` extends the shared
envelope ([documents.md](documents.md)) and stays system-agnostic: the game
system's own data lives in the opaque `system` payload. Rationale in
[ADR 0014](adr/0014-actor-document-shape.md).

## Fields (beyond the envelope)

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'actor'` | Literal |
| `kind` | `'character' \| 'npc' \| 'hazard'` | One document type for all three, per CLAUDE.md |
| `name` | non-empty string | |
| `portrait` | non-empty string, optional | A content-addressed asset (`<hash>.<ext>`). Absent means the client shows a placeholder; no default image is stored |
| `system` | object | Opaque to core. `systems/pf2e` validates it (`characterDataSchema`, a later PR); the server re-validates after every mutation |

## Permissions

Stored on the envelope, resolved by `resolvePermission` ([operations.md](operations.md)).
Planned defaults (enforced by later server PRs, not by this schema): a player
character is `observer` for everyone with the creator seat as `owner`; the GM
always resolves to `owner`. `none` keeps an actor (a hidden NPC) from being
sent to a seat at all.

## Example

```ts
actorSchema.parse({
  id: crypto.randomUUID(),
  worldId,
  type: 'actor',
  schemaVersion: 1,
  permissions: { default: 'observer', seats: { [seatId]: 'owner' } },
  createdAt: now,
  updatedAt: now,
  kind: 'character',
  name: 'Invented Hero',
  system: {},
});
```

## Testing

`packages/core/src/actor.test.ts`: a well-formed actor with its `system`
payload passed through untouched, an optional portrait, all three kinds,
rejection of an unknown kind / empty name / empty portrait / wrong `type`, and
a `system` that is missing, a string, or an array.

## The PF2e payload: `characterDataSchema`

`systems/pf2e`'s `characterDataSchema` (`content/character.ts`) is what a
`character` actor stores in `system` (ADR 0014). It holds inputs only; every
total is derived by `prepareCharacter` (a later PR) and never stored.

| Field | Notes |
| --- | --- |
| `level` | Integer 1-20 |
| `attributes` | The six attribute **modifiers** (`str`..`cha`), not scores |
| `keyAttribute` | Drives the class DC |
| `ranks` | Explicit proficiency ranks: `perception`, the three saves, `classDc`, `weapons` (unarmed/simple/martial/advanced), `armor` (unarmored/light/medium/heavy), and an open `skills` record so a Lore needs no special case. Anything absent is `untrained` |
| `ancestry`, `heritage`, `background`, `class` | Optional `{ name, source? }` references; a hand-built character may use none |
| `ancestryHp`, `classHp` | Inputs to max HP (`ancestryHp + (classHp + con) * level`); max HP itself is derived |
| `hp` | `{ current, temp }` |
| `items` | Embedded copies of weapon, armor, gear, feat, classFeature, spell, and action entries, each with its own id, an optional `source`, `equipped`, and `quantity` |
| `conditions` | `{ slug, value? }`, one per slug. Modifiers are computed, never stored ([conditions.md](conditions.md)) |
| `choices` | Made `choiceSet` selections, keyed by `rollOptionPrefix` |

A character cannot list two items with the same id, or one condition twice
(two sources of a valued condition merge to the higher value before they get
here; that logic is a later PR).

Tested in `systems/pf2e/src/content/character.test.ts`: defaults for a minimal
character, explicit ranks including a Lore, embedded items and their defaults,
an uncarriable entry kind, duplicate item ids, duplicate conditions, and range
checks.
