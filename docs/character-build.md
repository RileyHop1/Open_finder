# Character build

How a character's *choices* are recorded and turned into numbers. The
decision is in [ADR 0024](adr/0024-character-build-record.md); this page is
the shape it implements. Nothing here is built yet: it is the spec the
milestone 8 PRs (A2 to A6) implement, and each PR updates this page.

Every rules fact below is marked **(confirm)** until it has been checked
against Archives of Nethys (CLAUDE.md, "Rulings and ambiguity") and the date
noted in [rulings.md](rulings.md).

## The `build` record
Optional on the character's `system` payload. A character without one is
hand-built and stays valid. It holds choices only, never results:

| Field | What it records |
| --- | --- |
| `ancestry`, `heritage`, `background`, `class` | Compendium references (`packId`, `slug`) |
| `keyAttribute` | The class's key attribute, when the class offers a choice |
| `boosts` | Attribute boosts by source: `ancestry`, `background`, `class`, `free` at level 1, then one list each at levels 5, 10, 15 and 20 |
| `skills` | The trained skills chosen at level 1, and the skill increase chosen at each level that grants one |
| `feats` | The feat picked in each slot (ancestry, class, skill, general), keyed by slot and level |
| `languages` | Chosen languages |
| `choices` | Class- and feature-specific picks (racket, instinct, methodology, style, and so on), keyed by the choice-set that offered them |

## Derivation
`deriveCharacter(build, entries, level)` is pure. It returns proposed
attribute modifiers, proficiency ranks, `ancestryHp`, `classHp`, speed, the
class features due by `level`, the items they grant, and a list of
`warnings`. It never throws on a rules problem and never refuses a choice.

Ranks come from the class's progression tables (`rankAtLevel`), plus the
trained skills the build records. Granted items are resolved depth-limited
and de-duplicated.

## Boosts
A boost adds +1 to an attribute **modifier**. From a modifier of +4 upward a
boost is a *partial* boost, and two partial boosts make +1 **(confirm)**.
The derivation replays the boosts in order, so no half-step is stored.

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
