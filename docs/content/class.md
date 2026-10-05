# `class`, `classFeature`

The data behind the golden character set (milestone 2, Stack E) and the
character sheet's math (Stack D). See [../content-model.md](../content-model.md)
for the shared vocabulary and [../compendium.md](../compendium.md) for the
envelope.

## Proficiency progressions, not a single starting rank

`class.proficiencies` covers perception, the three saves, class DC, four
weapon categories, and four armor categories -- each as a
`ProficiencyProgression`: the level each rank is reached, straight from
Player Core's class tables. This is rules *data*, not a wizard mechanic, and
it's what lets Stack D compute a real answer at any level (the golden set's
level 5/11/17 fixtures need this, not just level 1).

```ts
{ trained: 1, expert: 5, master: 11, legendary: 17 }
```

**A rank can be present with no lower rank set.** A Fighter's martial-weapon
progression is `{ expert: 1 }` with no `trained` entry -- level 1 is a
starting point, not a rank-up event, so there's no separate moment of first
becoming trained to record. Only whichever ranks *are* present are
validated, and only for strictly increasing levels.

`rankAtLevel(progression, level)` reads a progression back into the rank
held at a given level -- the highest rank whose threshold has been reached,
or `untrained` if none has.

### Skill proficiency is different

Unlike weapons/armor/saves/perception/class DC, there is no fixed per-class
table for *which skill* becomes expert at a given level -- "skill
increases" let the player pick any trained skill to bump, at levels that
are the same across classes. Only the level-1 starting count
(`classSkillsSchema.trainedSkillCount`) is class data; the per-level choice
is milestone 8's wizard, not this schema.

## `class` fields

| Field | Type | Notes |
| --- | --- | --- |
| `keyAttributeOptions` | `readonly Attribute[]`, min 1 | More than one means a player choice (Fighter: Strength or Dexterity); exactly one means fixed (Wizard: Intelligence) |
| `hpPerLevel` | positive integer | |
| `proficiencies` | perception/savingThrows/classDc/weapons/armor, each a progression | See above |
| `skills.trainedSkillCount` | non-negative integer | The class's own contribution, before the universal Intelligence-modifier addition |
| `skills.automaticallyTrained` | `readonly string[]` | Skills trained regardless of player choice (e.g. a Barbarian's automatic Athletics) |

## `classFeature` fields

| Field | Type | Notes |
| --- | --- | --- |
| `classSlug` | string | Which class grants this, by slug in the `classes` pack |
| `level` | integer 1-20 | |

The relationship is stored on the feature, not as a list on the class entry
-- a class has dozens of features across 20 levels, and this keeps each side
of the relationship in exactly one place.

## Testing

See `class.test.ts`: every progression boundary case (full, partial, empty,
starting directly at a higher rank, non-increasing levels rejected), a
fighter-shaped class (a key-attribute choice, dense proficiencies) and a
wizard-shaped one (a single fixed key attribute, low HP), and
`classFeatureEntrySchema`'s level bounds.
