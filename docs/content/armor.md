# `armor`

Fields scoped to what Stack D's AC math needs. See
[../content-model.md](../content-model.md) for the shared vocabulary and
[../compendium.md](../compendium.md) for the envelope.

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `category` | `unarmored \| light \| medium \| heavy` | Which armor proficiency applies |
| `group` | one of `ARMOR_GROUPS`, optional | Absent for the rare armor with no group |
| `acBonus` | non-negative integer | The item bonus to AC |
| `dexCap` | non-negative integer, optional | Maximum Dexterity modifier this armor allows toward AC; absent means uncapped |
| `checkPenalty` | zero or negative integer, default `0` | Applies to Strength/Dexterity-based skill checks when `strength` isn't met |
| `speedPenalty` | zero or negative integer, default `0` | Applies to speed when `strength` isn't met |
| `strength` | positive integer, optional | Minimum Strength score to avoid the two penalties above; absent means no requirement |

## Example

```ts
{
  kind: 'armor',
  slug: 'full-plate',
  name: 'Full Plate',
  category: 'heavy',
  group: 'plate',
  acBonus: 6,
  dexCap: 0,
  checkPenalty: -3,
  speedPenalty: -10,
  strength: 18,
}
```

## Testing

See `systems/pf2e/src/content/armor.test.ts`: every category and group
accepted, armor with no group, penalty defaults, a positive penalty
rejected (penalties are zero or negative by construction), and a negative
`acBonus` rejected.
