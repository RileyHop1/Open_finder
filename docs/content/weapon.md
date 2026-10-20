# `weapon`

A weapon's mechanical fields, scoped to what strike attack/damage math
(milestone 2, Stack D) and the sheet's display need. See
[../content-model.md](../content-model.md) for the shared vocabulary this
builds on and [../compendium.md](../compendium.md) for the envelope.

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `category` | `unarmed \| simple \| martial \| advanced` | Which weapon proficiency a strike with this weapon uses |
| `group` | one of `WEAPON_GROUPS` | Drives critical specialization effects (not yet implemented -- no v1 consumer) |
| `damage` | `{ diceNumber, dieFaces?, damageType }` | Base damage, structured rather than a pre-built expression -- Stack D combines it with striking runes, ability modifier, and trait dice (deadly, fatal) at roll time. No `dieFaces` makes `diceNumber` a flat amount (a Blowgun's or an Acid Flask's 1); `diceNumber` 0 deals none (a Glue Bomb) |
| `splash` | positive integer, optional | An alchemical bomb's splash damage, of the base type, never doubled on a critical hit |
| `persistent` | `{ diceNumber, dieFaces?, damageType }`, optional | Persistent damage a hit leaves (an Acid Flask's 1d6 acid); no `dieFaces` is a flat amount. Shown on the strike; applied to the target by hand |
| `hands` | `1 \| 2` | |
| `range` | integer feet, optional | Absent for melee-only; present on a thrown melee weapon too |
| `reload` | non-negative integer, optional | Absent when nothing needs reloading (melee, most bows, thrown) |

An ordinary weapon's `damage.damageType` is physical (`bludgeoning`, `piercing`,
`slashing`) -- an elemental rune adds *extra* damage of another type on top; it
never changes the weapon's own base type. An alchemical bomb's base damage can be
any damage type (an Alchemist's Fire is fire), so the schema takes the full list.

**Deliberately not modeled yet:** bulk, price, level (for precious-material
or runed items), and usage. None of milestone 2's rules math touches
encumbrance or the shop, so adding these now would be speculative structure
ahead of a real consumer.

## Example

```ts
{
  kind: 'weapon',
  slug: 'longsword',
  name: 'Longsword',
  category: 'martial',
  group: 'sword',
  damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
  hands: 1,
  traits: ['versatile-p'],
}
```

## Testing

See `systems/pf2e/src/content/weapon.test.ts`: every category, group, and
base damage type accepted; an alchemical bomb (energy type, flat or no damage, splash,
persistent) accepted, and a damage type that is not one rejected; a
melee weapon (no range/reload) and a ranged weapon (range + reload) both
valid; an invalid die size and an invalid hands value both rejected.
