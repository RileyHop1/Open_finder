# Character build

How a character's *choices* are recorded and turned into numbers. The
decision is in [ADR 0024](adr/0024-character-build-record.md); this page is
the shape it implements. The server side is built: the `build` schema and
progression tables, boost math, `deriveCharacter`, the compendium filters, and
the `actor.applyBuild` operation (`apps/server/src/applyBuild.ts`). The wizard
UI is not.

Every rules fact below is marked **(confirm)** until it has been checked
against Archives of Nethys (CLAUDE.md, "Rulings and ambiguity") and the date
noted in [rulings.md](rulings.md).

## The `build` record
Optional on the character's `system` payload. A character without one is
hand-built and stays valid. It holds choices only, never results:

| Field | What it records |
| --- | --- |
| `ancestry`, `heritage`, `background`, `class` | Compendium references (`packId`, `slug`) |
| `flaws` | Attributes the ancestry lowers, one -1 step each |
| `boosts` | Batches of `{ level, source, attributes }`: level 1, 5, 10, 15 or 20, from `ancestry`, `background`, `class` or `free` |
| `trainedSkills` | Skills trained at creation beyond the automatic ones (a Lore is `<name>-lore`) |
| `skillIncreases` | `{ level, skill }` for each skill increase taken |
| `feats` | `{ slot, level, feat }`: slot is `ancestry`, `class`, `skill`, `general` or `archetype` |
| `languages` | Chosen languages |
| `classChoices` | Class- and feature-specific picks (racket, instinct, methodology, style, and so on), keyed by the choice that offered them. Named apart from the character's own `choices`, which holds rule-element selections |

The key attribute stays where it already is, on the character
(`keyAttribute`); the build does not duplicate it. The schema stores choices
and checks nothing: a repeated boost or a feat in the wrong slot is storable,
and warning about it is the derivation's job.

The schema is `characterBuildSchema` (`systems/pf2e/src/content/characterBuild.ts`)
and the table helpers are in `systems/pf2e/src/rules/progression.ts`.

## Derivation
`deriveCharacter` (`systems/pf2e/src/rules/deriveCharacter.ts`) is pure. Its
inputs are the build, the level, an optional key attribute, the ancestry,
heritage, background and class entries, the class's features, and a
`resolve(packId, slug)` callback that finds a compendium entry (the server
supplies it from its own compendium). It returns proposed attribute
modifiers, the key attribute, proficiency ranks, `ancestryHp`, `classHp`,
speed, the items (class features due by level, picked feats, and whatever
they grant) and a list of `warnings`. It never throws on a rules problem and
never refuses a choice.

- **Ranks:** the class's progressions through `rankAtLevel`, then skills
  (the class's automatic ones, the background's, and the build's chosen ones),
  then each skill increase raises its skill one step. Until the rank-up table
  exists (below) ranks are right at level 1, where the imported starting ranks
  are the whole story.
- **Granted items:** `grantItem` elements are followed to `MAX_GRANT_DEPTH`
  (3) and de-duplicated by pack and slug; an entry that cannot be found is a
  `missing-entry` warning.
- **Warnings:** a key attribute the class does not offer, more trained skills
  than the class plus Intelligence allow, a skill increase or feat taken at a
  level or slot the class does not have, a missing entry, and the boost
  warnings below.

The level 1 build-derived characters for the seven martial classes (Fighter,
Ranger, Rogue, Barbarian, Investigator, Monk, Swashbuckler) are pinned to the
hand-set goldens in `systems/pf2e/src/golden/deriveMartial.test.ts`.

## Boosts
A boost adds +1 to an attribute **modifier**. From a modifier of +4 upward a
boost is a *partial* boost, and two partial boosts make +1 **(confirm)**.
`applyBoosts` (`systems/pf2e/src/rules/boosts.ts`) replays the flaws and
boosts, lowest level first, from all-zero modifiers, so no half-step is stored;
a pending partial is only a flag in the result.

Within one source an attribute may be boosted once **(confirm)**. A second
boost of the same attribute from the same source produces a warning and is
still applied (ADR 0023).

## Progression tables
The feat and skill-increase levels come from each class's own imported data
(`ClassEntry.advancement`, checked against the pinned upstream in A1: every
class reads ancestry feats at 1, 5, 9, 13 and 17, general feats at 3, 7, 11,
15 and 19, skill increases at odd levels from 3, and class and skill feats
at even levels, with class feats also at 1). The table below is the standard
set and what the derivation falls back to; the attribute-boost levels are
not in class data. All remain **(confirm)** against Archives of Nethys.

| What | Levels | |
| --- | --- | --- |
| Attribute boosts (four each) | 5, 10, 15, 20 | **(confirm)** |
| Ancestry feats | 1, 5, 9, 13, 17 | **(confirm)** |
| Class feats | 1, then every even level | **(confirm)** |
| Skill feats | 2 and every even level (classes that grant a bonus skill feat are class data) | **(confirm)** |
| General feats | 3, 7, 11, 15, 19 | **(confirm)** |
| Skill increases | 3 and every odd level after | **(confirm)** |

## Rank-ups
Upstream gives a class's *starting* ranks but not when they improve (that is
in feature description text). The rank-up levels are therefore our own table
in `systems/pf2e/src/rules/progression.ts`, authored from the rules and
pinned by golden tests, one entry per class and statistic. The importer
supplies the starting rank; the table supplies `master`, `expert` and
`legendary` levels. Every class is trained in its class DC at level 1
**(confirm)**.

## The creator
`CharacterCreator.vue` (`apps/client/src/components/creator/`) is the
full-screen wizard, opened from the Characters panel's "Guided creation…"
button. A step rail (Ancestry, Background, Class, Class choices, Attributes,
Skills, Feats, Equipment, Review) runs down the left, the current step is in
the middle, and the real character sheet shows the character so far on the
right, derived live with `deriveCharacter`. It is a modal dialog: focus moves
in, Tab stays inside, Escape closes it.

The draft (name, step, build) is saved in this browser only
(`creatorModel.ts`), so closing or reloading does not lose it; "Start over"
forgets it. Nothing is sent to the server until the final step creates the
character. The steps arrive one PR at a time; until a step's PR lands it shows
a placeholder.

## Applying a build
`actor.applyBuild { actorId, build, keep? }` (owner or GM): the server copies
every entry from its own compendium, derives, and writes the build, derived
values and items in one transaction. `keep` names value paths to leave
untouched. The client sends choices only.

## Level-up
`levelUpPlan(character, toLevel)` derives at the new level and compares with
the stored values. It lists what is gained, what needs a choice, and every
hand-edited value that differs from what the old build derived; the player
keeps or accepts each line.

## Starting equipment
A new character starts with 15 gp to spend **(confirm)**. Spending over it is
shown as a warning, never blocked.
