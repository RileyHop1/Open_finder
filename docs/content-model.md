# PF2e content model

The shared vocabulary every `systems/pf2e` content schema (feat, weapon,
spell, ancestry, class, creature, ...) builds on. See
[compendium.md](compendium.md) for the envelope these fit inside, and
[rule-elements.md](rule-elements.md) for how automation attaches to an entry.

## Rarity

```ts
RARITIES = ['common', 'uncommon', 'rare', 'unique']
```

## Proficiency rank

```ts
PROFICIENCY_RANKS = ['untrained', 'trained', 'expert', 'master', 'legendary']
```

`PROFICIENCY_BONUS` maps each rank to its flat bonus component (untrained 0,
trained 2, expert 4, master 6, legendary 8). This is the rank component
only -- the level component that every rank except untrained also adds is
computed by the rules layer (`proficiencyModifier`, milestone 2's Stack D),
not stored here, because a content primitive should not depend on an actor's
level.

## Attribute

```ts
ATTRIBUTES = ['str', 'dex', 'con', 'int', 'wis', 'cha']
```

Slugs, not full names -- matches how a `Modifier.selector` or a rule
element's `selector` field references one (`docs/modifiers.md`).

## Action cost

```ts
ACTION_COSTS = ['free', 'one', 'two', 'three', 'reaction']
```

The fixed costs the north star's action bar displays as ◆ / ◆◆ / ◆◆◆ / a
reaction icon. Variable costs (an ability usable for a range of action
counts) are not a shared primitive -- no content kind needed one common
enough to generalize yet, so it's each schema's own concern if and when it
comes up.

## Damage type

```ts
DAMAGE_TYPES = [
  'bludgeoning', 'piercing', 'slashing',
  'acid', 'cold', 'electricity', 'fire', 'force', 'sonic',
  'mental', 'poison', 'bleed',
  'vitality', 'void',
  'chaotic', 'evil', 'good', 'lawful',
]
```

Every damage type the Remaster rules use, including the four alignment
types (rare after the Remaster, but not removed) and the Remaster's
`vitality`/`void` naming (replacing legacy "positive"/"negative"). A
weapon's own base damage is always one of the three physical types --
`weapon.ts`'s `WEAPON_DAMAGE_TYPES` is that strict subset. **(confirm)** this
list is exhaustive against real upstream data during the importer PRs.

## Trait slugs

`traitSlugSchema` validates a lowercase, kebab-case, alphanumeric slug --
`agile`, `two-hand-d8`, `deadly-d10`, `humanoid`. Every content kind's
`traits` field is `readonly string[]` validated against this, not a free
string, so a malformed trait fails at import time rather than becoming a
tag nothing ever matches.

## The entry union

Every content kind is one variant of `pf2eEntrySchema`
(`systems/pf2e/src/content/entry.ts`), discriminated on `kind`:

```
action, feat, weapon, armor, gear, spell,
ancestry, heritage, background,
class, classFeature,
creature, condition
```

This is what the importer (milestone 2, Stack C) validates each converted
entry against before writing it, and what a future pack loader reading one
back gets. `conditionEntrySchema` is a refined schema (its `.refine()` checks
`maxValue` only applies to a valued condition), not a plain `z.object` like
the other twelve -- `z.discriminatedUnion` was confirmed to handle that
correctly (both routing and running the refinement) before relying on it,
rather than assumed.

## Testing

See `systems/pf2e/src/content/common.test.ts`: acceptance of every value in
each closed vocabulary, rejection of values outside it, a cross-check that
`PROFICIENCY_RANKS` and `PROFICIENCY_BONUS` name exactly the same ranks, and
the trait slug format's boundary cases (empty, uppercase, spaces,
underscores, leading/trailing hyphen).

See `systems/pf2e/src/content/entry.test.ts` for the union: one minimal
well-formed entry per kind, a kind routed to a schema that then rejects it
for missing kind-specific fields, the condition refinement still firing
through the union, and a cross-check that `PF2E_ENTRY_KINDS` names exactly
the kinds the union accepts.
