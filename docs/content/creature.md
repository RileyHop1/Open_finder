# `creature`

NPC and monster stat blocks. See [../content-model.md](../content-model.md)
for the shared vocabulary and [../compendium.md](../compendium.md) for the
envelope.

## Finished numbers, not resolved ones

Unlike a PC, a creature's AC, saves, skills, perception, and strike bonuses
are already the finished product straight from the book -- flat integers,
not built from proficiency rank + attribute. Nothing here runs through
`resolveStatistic` (`docs/modifiers.md`); there is nothing left to resolve.

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `level` | integer -1 to 30 | |
| `size` | one of `SIZES` | |
| `perception` | integer | Flat modifier |
| `ac` | positive integer | |
| `savingThrows` | `{ fortitude, reflex, will }`, each an integer | |
| `hp` | positive integer | |
| `resistances`, `weaknesses` | `{ damageType, value }[]` | `damageType` is a free string -- real stat blocks have entries ("physical", "precision", "all-except-force") that aren't damage types at all |
| `speeds` | `{ land, fly?, swim?, climb?, burrow? }` | |
| `attributes` | `{ str, dex, con, int, wis, cha }`, each an integer | Modifiers, not raw scores -- creature stat blocks never print raw ability scores |
| `skills` | `Record<string, number>`, default `{}` | Open, like `background.trainedSkills`, so Lore skills need no special case |
| `strikes` | [CreatureStrike](#creaturestrike)`[]`, default `[]` | |
| `languages` | `readonly string[]`, default `[]` | |

### `CreatureStrike`

```ts
{
  name: 'venomous bite',
  attackBonus: 9,
  traits: ['reach-10-feet'],
  damage: [
    { diceNumber: 1, dieFaces: 8, bonus: 4, damageType: 'piercing' },
    { diceNumber: 1, dieFaces: 4, bonus: 0, damageType: 'poison' },
  ],
}
```

`damage` is one or more components (a strike with a persistent-damage or
extra-element rider has more than one). `bonus` defaults to `0`. A rare
flat-only rider with no dice at all is not representable in v1 -- golden
creatures are ours to invent, so this doesn't block them; revisit only if
the importer's real data needs it.

## Golden fixtures

A published creature's stat block is Paizo content (ADR 0003). Golden
creatures (Stack E) are our own invented monsters with hand-computed
stats -- never a stat block pasted from the compendium.

## Testing

See `creature.test.ts`: a minimal creature with every optional collection
defaulted, a negative level, non-land speeds, an open skills record,
resistances/weaknesses including a non-damage-type entry, single- and
multi-component strikes, an empty-damage strike rejected, and level/size/
ac/hp boundary cases.
