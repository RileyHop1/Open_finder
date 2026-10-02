# Combat

An encounter, and one token's place in it. `@hearthtable/core`'s `combatSchema`
and `combatantSchema` extend the shared envelope ([documents.md](documents.md)).
Why they are shaped this way is
[ADR 0018](adr/0018-combat-tracker.md); how a turn spends actions is
[action-economy.md](action-economy.md); how conditions end is
[conditions.md](conditions.md).

Milestone 5 adds the schemas first (this page), then the rules in
`systems/pf2e`, the server operations, and the tracker UI. Sections below say
which parts exist so far.

## Two documents
A `Combat` holds only where the encounter is in time. Each creature in it is a
`Combatant`, a document of its own, so a hidden monster is simply a document a
player may not read and spending one action writes one small row.

The initiative **order is never stored**. It is derived from the combatants'
initiative (and a tie rule, [rulings.md](rulings.md)), so adding a
late arrival or fixing a roll changes no other document, and the turn pointer is
an id, not a position that could drift onto the wrong creature.

## Combat fields (beyond the envelope)

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'combat'` | Literal |
| `sceneId` | UUID | The scene the fight is on. Whether it exists is the server's check, not the schema's |
| `status` | `pending` \| `active` \| `ended`, default `pending` | `ended` is kept as a record until the GM deletes it. Only one combat per world may be `active`: the server enforces that |
| `round` | integer 0-9999, default 0 | 0 until the combat starts, then 1 and counting |
| `activeCombatantId` | UUID, optional | Whose turn it is. Absent before the start and after the end. A player may not be able to read this combatant (a hidden creature acting): they are shown "someone's turn" and nothing else |

## Combatant fields (beyond the envelope)

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'combatant'` | Literal |
| `combatId` | UUID | The combat it is in |
| `tokenId` | UUID | The token that fights. A combatant is a token on a scene, so a creature with no token cannot join: the GM places one first |
| `actorId` | UUID | The actor behind the token |
| `initiative` | integer, optional | Absent until rolled or set; an unrolled combatant sorts last. Any integer from -1000 to 1000, negatives included |
| `defeated` | boolean, default `false` | Out of the fight. Still listed for the GM, skipped by the turn order |
| `hidden` | boolean, default `false` | Whether players see it in the order. The server derives the permissions from this, never the client |
| `turn` | [turn state](#turn-state), default all zero | What it has used this turn |

### Turn state

| Field | Type | Notes |
| --- | --- | --- |
| `actionsSpent` | integer 0-99, default 0 | Allowed to exceed the turn's capacity: the app warns and never blocks ([action-economy.md](action-economy.md)). The capacity itself (3, less slowed, more quickened) is a rule, not stored |
| `reactionUsed` | boolean, default `false` | Refreshed at the start of the combatant's turn |
| `attacksMade` | integer 0-99, default 0 | The Multiple Attack Penalty counts attacks, not actions. Reset at the start of the combatant's turn |

It lives on the combatant, not the actor: it means nothing outside a fight, and
leaving a combat must leave the actor exactly as it was, apart from the real
changes (hit points, conditions).

## Turn order
`sortByInitiative`, `nextCombatant`, and `previousCombatant`
(`systems/pf2e/src/rules/initiativeOrder.ts`) are pure functions over plain
entries (`id`, `initiative`, `defeated`, `isCharacter`, `createdAt`), so the server
and the tracker panel share one answer.

- **Order:** highest initiative first. Ties: a player character before a monster,
  then who joined first, then the id ([rulings.md](rulings.md), "Initiative
  ties"). An unrolled combatant sorts last.
- **Who takes turns:** a combatant with an initiative who is not defeated. An
  unrolled one waits in the list until it rolls; a defeated one stays in place for
  the GM but is skipped.
- **Stepping:** `nextCombatant` and `previousCombatant` return who is next and
  whether the step went past the end (or start) of the order, which is when the
  round changes. With nobody active, forward gives the first and counts as the
  start of round 1. An id no longer in the order is treated as nobody, so the
  server steps *before* it removes a combatant.

## Permissions
The server derives them and a client never sets them, as for a token
([token.md](token.md)). That arrives with the operations that create these
documents (milestone 5's server stack); until then nothing writes one.

## Example
```ts
combatSchema.parse({
  id: '4b1e7c20-9d3a-4f6e-8c11-2a5d7e9f0b34',
  worldId: '0b9a3c52-7e0d-4a47-8a0a-6c1d0f6d2b88',
  type: 'combat',
  schemaVersion: 1,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  permissions: { default: 'observer' },
  sceneId: '2d7a4e0a-8a3f-4f0e-9d1c-5b6a1f9c3e21',
  status: 'active',
  round: 2,
  activeCombatantId: '9e2f6a18-1c4d-4b7a-a3e5-7d0c8b1f2a46',
});
```

## Testing
`packages/core/src/combat.test.ts`: a combat's defaults (pending, round 0,
nobody active) and a running one kept; every status and no other; a round that is
negative, a fraction, or past the bound; a malformed active id and a missing scene.
A combatant's defaults (unrolled, in the fight, visible, a fresh turn); a negative
initiative kept; a partly written turn filled in; overspending allowed; an
initiative or counter that is a fraction, negative, or past its bound; and each of
the three required ids.
