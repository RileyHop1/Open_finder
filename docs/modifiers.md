# Modifiers and the resolver

How every number in the app -- AC, saves, skills, strikes, DCs -- gets
computed, and why there is exactly one function that does it. See
[adr/0008-modifier-resolution.md](adr/0008-modifier-resolution.md) for the
decision; this page is the implementation spec.

## Why one resolver

"Show the math" (CLAUDE.md, Player experience) means clicking any number and
seeing where each piece came from. That only stays true if the number and its
explanation are the same computation. `resolveStatistic` is that computation --
`systems/pf2e`'s rules math never sums modifiers itself.

## Modifier

```ts
{
  slug: 'flat-footed',
  label: 'Off-Guard',
  type: 'circumstance',
  value: -2,
  source: 'Off-Guard condition',
  predicate: 'target:off-guard', // optional
  enabled: true,
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `slug` | string | Stable identifier, used for tie-breaking and for `suppressedBy` references |
| `label` | string | Display name |
| `type` | `circumstance \| status \| item \| untyped \| proficiency \| ability` | Which stacking rule applies |
| `value` | integer | Positive for a bonus, negative for a penalty |
| `source` | string | The item, feat, condition, or spell this came from -- required, so a breakdown can always answer "why is this here" |
| `predicate` | [Predicate](#predicate) | Optional; absent means unconditional |
| `enabled` | boolean | The GM override switch -- a modifier can be turned off without deleting it |

## Predicate

A small boolean-logic language, scoped to what the v1 rule-element subset
needs (ADR 0004 decision 2):

```ts
type Predicate =
  | string                                    // roll-option presence test
  | { all: readonly Predicate[] }             // AND
  | { any: readonly Predicate[] }             // OR
  | { not: Predicate };                       // NOT
```

An empty `all` is vacuously true; an empty `any` is vacuously false -- ordinary
boolean semantics for "every condition holds" and "some condition holds" with
no conditions to check.

**Not supported in v1:** comparison operators (`gt`, `lt`, `eq`, ...) and the
exclusive combinators (`xor`, `nand`, `nor`) that upstream's predicate
language has. A rule element whose predicate needs one of those imports
inert, with the reason recorded -- see `docs/importer.md` (milestone 2) and
ADR 0004 decision 4.

## Stacking rules

- **`circumstance`, `status`, `item`** are typed. Within each type, bonuses
  (`value >= 0`) and penalties (`value < 0`) are separate groups. Only the
  highest bonus and the worst (most negative) penalty of each type apply; the
  rest are suppressed by whichever one won.
- **`untyped`, `proficiency`, `ability`** always stack. They are never
  suppressed by anything, including each other or multiple modifiers of the
  same type.
- **A disabled modifier, or one whose predicate fails**, does not apply --
  and does not participate in suppression at all. It cannot win a group, and
  it cannot be the thing another modifier loses to.
- **Ties are broken by slug**, alphabetically first winning. This is an
  arbitrary rule, chosen only so the same modifier set resolves identically
  regardless of what order it was assembled in -- golden tests depend on that
  stability.

## Statistic

```ts
{
  total: 3,
  modifiers: [
    { slug: 'bless', ..., applied: true },
    { slug: 'heroism', ..., applied: false, suppressedBy: 'bless' },
  ],
}
```

`total` is always the sum of every modifier where `applied: true`. Suppressed
modifiers are retained, never filtered out -- they are the answer to "why
isn't my bonus showing up," which is the specific reason ADR 0008 rejected
discarding them.

## Testing

See `packages/core/src/resolveStatistic.test.ts`: one case per stacking rule
above (typed bonus, typed penalty, always-stacking types, disabled, predicate
gating, tie-break stability under reordering), plus the worked example from
ADR 0008 itself (a +3 status bonus beating a +2 status bonus). `predicate.ts`
and `predicate.test.ts` cover the predicate language on its own.
