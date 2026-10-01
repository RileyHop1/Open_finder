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
Enforced by the server (`apps/server/src/actors.ts`, `writeGuard.ts`):

- **Any seat may create** an actor with `actor.create` and becomes its `owner`.
  Everyone else is `observer`, so the party can see each other's sheets. The GM
  can change either later.
- **Changing or deleting needs `owner`**, and the GM always resolves to `owner`.
  A document a seat cannot read is reported as not found, not as forbidden.
- **`none` keeps an actor** (a hidden NPC) from being sent to a seat at all
  ([operations.md](operations.md), "Who receives what").
- A new `character` starts blank: level 1, every attribute modifier 0, every
  rank untrained, 0 HP (`newCharacterData`). Blank on purpose, since any starting
  number would be an arbitrary choice. NPCs and hazards start with an empty
  `system` until their schemas exist.
- Deleting an actor does not yet remove it from a party; `party.*` operations (a
  later PR) do that.

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
| `ancestryHp`, `classHp` | Inputs to max HP. Max HP itself is derived by `buildMaxHitPoints` (`ancestryHp + (classHp + con) * level`, plus `hp`-selector rule elements and drained), never stored |
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

## Deriving the sheet: `prepareCharacter`

`prepareCharacter(data)` (`systems/pf2e/src/rules/prepareCharacter.ts`) turns
stored `CharacterData` into every number the sheet shows. The sheet, the
server's roll handlers, and the golden tests all call it, so a value is computed
one way. It returns:

- `statistics`, keyed `ac`, `fortitude`, `reflex`, `will`, `perception`,
  `classDc`, and `skill:<slug>` for all sixteen named skills plus any Lore in
  `ranks.skills`. Each is a `Statistic` with its full modifier breakdown.
- `hp`: stored `current` and `temp`, plus `max` as a `Statistic`.
- `strikes`: one per equipped weapon (below).
- `inertItems`: items carrying automation we could not map, for the sheet to
  flag "automation not applied" (ADR 0004).
- `rollOptions`: what rule elements activated.

Strikes come from `prepareStrikes` (below) and ride along as `strikes`.

**Active items.** Feats, class features, actions, and spells always contribute
rule elements. Weapons, armor, and gear only while `equipped`.

**Selectors.** A rule element's `selector` picks its statistic: `ac`,
`fortitude`/`reflex`/`will`, `perception`, `class-dc`, `skill:<slug>`, `hp`.
The importer passes upstream selector strings through, so these upstream
spellings are accepted as aliases: a bare skill slug (`athletics`),
`saving-throw` (all three saves), `skill-check` (all skills), and `all`
(every statistic except HP). **(confirm)** the alias list against the
importer's coverage report.

Tested in `systems/pf2e/src/rules/prepareCharacter.test.ts`, including a
character built to match the golden Fighter's values.

### Strikes: `prepareStrikes`

One `PreparedStrike` per **equipped** weapon, keyed `strike:<weapon slug>`
(`-2`, `-3` for further copies). Each has `attacks` (a `Statistic` for the 1st,
2nd, and 3rd attack of a turn, so the Multiple Attack Penalty is visible),
`damageModifiers` (a `Statistic` for the flat part of damage), `damage`
(components for a hit and a critical hit), and `attackInputs` / `damageInputs`,
the exact arguments the server passes to `rollStrikeAttack` /
`rollStrikeDamage`, so the sheet and a roll cannot disagree.

- **To hit:** Strength for melee, Dexterity for a weapon with a `range`, and the
  better of the two for a melee `finesse` weapon. Proficiency is the character's
  rank for the weapon's category.
- **Damage:** full Strength for melee and `thrown` weapons, half (rounded down)
  for `propulsive`, a negative Strength modifier in full, and nothing for other
  ranged weapons. Enfeebled and `strike-damage` rule elements are added;
  `strike-damage` dice become extra components.
- **Not modeled yet:** potency and striking runes (both 0, a visible gap), and an
  unarmed Strike, which every character has but which needs a compendium entry
  we do not have. A character with no equipped weapon has no strikes.

Tested in `systems/pf2e/src/rules/prepareStrikes.test.ts`.
