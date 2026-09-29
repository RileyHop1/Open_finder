# `spell`

PF2e's most structurally complex content kind. See
[../content-model.md](../content-model.md) for the shared vocabulary and
[../compendium.md](../compendium.md) for the envelope. This schema carries
the *data*; the mechanics that consume it (slots by rank, prepared vs.
spontaneous, what heightening does numerically) are milestone 7(b)'s job.

## No `components` field **(confirm)**

The Remaster replaced verbal/somatic/material components with two traits --
`concentrate` (can't cast if you can't think or speak) and `manipulate`
(needs a free hand, provokes reactions) -- carried on the shared `traits`
field. This is a rules-modeling decision, not a verified transcription;
check it against real upstream data during the importer PR.

## No ritual support

Rituals are catalogued separately from spells in real PF2e (no spell slot,
any character can attempt one with the right skill). No milestone currently
names them. `castTime` stays a free string precisely so this schema doesn't
need to special-case one.

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `rank` | integer 1-10 | Cantrip status is a trait (`cantrip`), not a separate field |
| `traditions` | `readonly MagicalTradition[]`, default `[]` | Empty for a focus spell (tied to a class, not a tradition) |
| `castTime` | non-empty string | Usually one of `ACTION_COSTS`' values |
| `range` | [SpellRange](#spellrange) | |
| `area` | `{ shape, size }`, optional | `shape` is the same four values milestone 5's area templates will use |
| `targets` | string, optional | Free text; no v1 math parses a target count |
| `duration` | string, optional | Absent means instantaneous, PF2e's default |
| `sustained` | boolean, default `false` | |
| `defense` | `{ save, basic }`, optional | `basic` marks the standard crit-success/success/failure/crit-failure damage scaling |
| `heightening` | [SpellHeightening](#spellheightening), optional | |

### `SpellRange`

A discriminated union: `{ kind: 'self' }`, `{ kind: 'touch' }`,
`{ kind: 'feet', value }`, or `{ kind: 'unlimited' }`.

### `SpellHeightening`

Either `{ kind: 'interval', interval, description }` (a flat effect repeated
every N ranks) or `{ kind: 'fixedRanks', entries: [{ rank, description }] }`
(a distinct effect at specific ranks). Both carry prose, like `description`
-- an automatable heightening effect goes through `ruleElements` instead.

## Example

```ts
{
  kind: 'spell',
  slug: 'fireball',
  name: 'Fireball',
  rank: 3,
  traditions: ['arcane', 'primal'],
  castTime: 'two',
  range: { kind: 'feet', value: 500 },
  area: { shape: 'burst', size: 20 },
  defense: { save: 'reflex', basic: true },
  heightening: {
    kind: 'interval',
    interval: 1,
    description: 'The damage increases by 2d6.',
  },
}
```

## Testing

See `systems/pf2e/src/content/spell.test.ts`: every tradition and range kind
accepted, an empty traditions array (focus spell), a malformed `feet` range
rejected, both heightening styles, an empty `fixedRanks.entries` rejected,
and rank bounds enforced.
