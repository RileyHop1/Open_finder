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
| `spells` | `{ cantrips, ranked }`: the spells picked for the class's spellcasting, as compendium references. Each is granted as a `spell` item; the cantrips go in the class entry's cantrips and, for a spontaneous caster, the ranked picks in its repertoire ([spellcasting.md](spellcasting.md)). Defaults to none of either |

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
  then each skill increase raises its skill one step, then each class feature's
  rank-ups (below).
- **Granted items:** `grantItem` elements are followed to `MAX_GRANT_DEPTH`
  (3) and de-duplicated by pack and slug; an entry that cannot be found is a
  `missing-entry` warning. A class feature is granted only from its own level,
  however it is granted: a Cleric's doctrine grants all six of its benefits, and
  each arrives at the level it names.
- **Class features due by level:** every untagged feature of the class at or below
  the level, except one another of the class's features grants. A doctrine's
  benefits are untagged upstream, so without that rule every Cleric would get both
  doctrines' benefits; they come only through the doctrine chosen.
- **Class choices:** a granted feature with a `choiceSet` (Instinct, Racket,
  Hunter's Edge, Methodology, Style...) reads its answer from
  `build.classChoices`, keyed by the choice's `rollOptionPrefix`. When the set
  has `grantsFromPackId`, the chosen feature is granted (and its own grants
  followed); its unchosen alternatives never are. The answers made come back as
  `choices`, which `actor.applyBuild` merges into the sheet's own `choices` so
  the rule-element roll options see them. A choice not yet made is a
  `choice-not-made` warning and grants nothing; one the feature does not offer
  is applied anyway with a `choice-not-offered` warning (ADR 0023).
- **Warnings:** a key attribute the class does not offer, more trained skills
  than the class plus Intelligence allow (plus one for each skill a class feature
  trains that was already trained, `skill-trained-twice`), a skill increase or feat taken at a
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
The class gives the *starting* ranks; each rank-up is on the class feature that
grants it, as `rankUps` (Bravery: Will expert at 3; Expert Spellcaster:
spellcasting expert at 7; a Warpriest's first doctrine: light and medium armor
trained and Fortitude expert at 1). The importer reads them from upstream's
`system.subfeatures.proficiencies` ([importer.md](importer.md)), so no rank-up
table needs authoring. `deriveCharacter` applies every class feature the character
has (each from its own level, a doctrine's through the doctrine chosen): a save,
Perception, the class DC, a weapon or armor category, or the spellcasting rank is
raised to the better of what the class gives and what the feature names, never
lowered. Checked on the pinned data (2026-10-17): a Fighter is expert in Will at 3
(Bravery) and in its class DC at 11; a Warpriest is expert in Fortitude and trained
in light and medium armor at 1 and casts as an expert at 11, a Cloistered Cleric at
7; a Ruffian is trained in medium armor and a Thief is not.

**Skills a class feature trains** (`skillRankUps`: the Thief racket's Thievery, a
Scoundrel's Deception and Diplomacy, a Druid order's skill) are applied the same
way, after the trained skills and before skill increases, so an increase lands on
top of them. One the character is already trained in is still applied, with a
`skill-trained-twice` warning: the rules have the character train another skill of
their choice instead, so the allowance for picked skills grows by one for each.

**Not raised, and flagged instead:** a rank-up upstream writes as a conditional
effect rather than in the feature's rank-ups (Armor Mastery's heavy armor, which
skips the Barbarian), or one tied to a chosen weapon group (Fighter Weapon Mastery)
or a deity's favored weapon. Those stay inert ("automation not applied") and the GM
sets the rank on the sheet. Every class is trained in its class DC at level 1
**(confirm)**.

## The creator
`CharacterCreator.vue` (`apps/client/src/components/creator/`) is the
full-screen wizard, opened from the Characters panel's "Guided creation…"
button. A step rail (Ancestry, Background, Class, Class choices, Attributes,
Skills, Feats, Spells, Equipment, Review) runs down the left, the current step is in
the middle, and the real character sheet shows the character so far on the
right, derived live with `deriveCharacter`. It is a modal dialog: focus moves
in, Tab stays inside, Escape closes it.

The draft (name, step, build) is saved in this browser only
(`creatorModel.ts`), so closing or reloading does not lose it; "Start over"
forgets it. Nothing is sent to the server until the final step creates the
character. The steps arrive one PR at a time; until a step's PR lands it shows
a placeholder.

The **ancestry** step lists the ancestries, shows what the chosen one gives
(Hit Points, size, speed, boosts, flaws, languages, trait tooltips), then lists
its heritages with the versatile ones after. Picking an ancestry clears the
heritage. The ancestry's boosts are listed there but applied in the Attributes
step. `useCreatorEntries` keeps the chosen entries loaded (also for a reopened
draft) so the preview can derive from them.

The **background** step lists the backgrounds (with a name search), and the
chosen one shows the boost it offers a choice of, the skills it trains and the
skill feat it grants (its `grantItem` elements). Its trained skills show on
the preview at once; its boost is applied in the Attributes step.

The **class** step lists the seven martial classes first (the ones the creator
builds completely), then the rest under a note that their spellcasting and
special features are set up in a later update; picking one of those shows a
visible warning and is never refused. A chosen class shows its Hit Points per
level, its trained skills, and its starting proficiencies in words, and offers
the key attribute as a choice when the class has more than one. Picking a
class forgets the key attribute, the class choices, the class feat and the spell
picks made for the one before.

The **class choices** step asks the questions the class's level 1 features ask
(`classChoices.ts` walks them: a Barbarian's instinct, a Rogue's racket, a
Ranger's Hunter's Edge, an Investigator's methodology, a Swashbuckler's style,
and the question a pick itself asks, such as which animal). Each is a radio
group; every option shows what it grants, and the answer is written to
`build.classChoices`, from which `deriveCharacter` grants the picked feature.
A question left open is marked "(not chosen yet)", never blocked. A feature
whose choice the importer could not map (Champion's cause, for one) is listed
with a note to settle it with the GM. The class's level 1 features load with
the class (`useCreatorEntries`).

The **attributes** step places the level 1 boosts: the ancestry's (its fixed
ones shown as already on, plus its free ones), the background's (one from the
two it offers, one free), four free boosts, and the class's key attribute
(chosen in the Class step). Each source is a row of toggles and a table beside
them shows every modifier live, with a note where a boost past +4 is only a
partial one. The draft keeps only what the player *picked* (`boostPicks`); the
fixed boosts and the key attribute are read from the entries every time
(`boostPlan.ts`, `composeBoosts`), so changing the ancestry or class can never
leave a stale boost behind. The composed boosts go into the preview now and
into the build when the character is created. Too many or too few picks in a
source, an option the background does not offer, or the same attribute twice,
are noted in words and still applied (ADR 0023).

The **skills** step shows the sixteen skills as toggles. The skills the class
and the background train outright are shown as already on ("trained by your
class"); the player picks the rest, as many as the class's count plus
Intelligence (read from the boosts picked so far, never below zero), and can
name a Lore of their own, stored as `<name>-lore`. The picks go in
`build.trainedSkills`, which `deriveCharacter` trains. Too many, or a skill the
class or background already trains, is noted in words and still applied
(ADR 0023). Skill increases are a level-up choice, not part of creation.

The **feats** step has a picker for each feat slot open at level 1 (an
ancestry feat and a class feat, from the class's own advancement table). A slot
lists the feats of its category up to the slot's level, narrowed by trait to
the character's own ancestry or class, with the feats whose prerequisites are
met first. A prerequisite is shown in words with a mark: simple ones ("trained
in Athletics") are checked against the skills the character is trained in
(`featPlan.ts`), a higher rank reads as not met at creation, and anything else
says "check with your GM". "Show every ... feat" lifts the narrowing. A feat
outside the narrowed list, or with a prerequisite that reads as unmet, can be
taken and says so (ADR 0023). A pick replaces the one before it in the same
slot and is stored in `build.feats`; picking another ancestry or class drops
that slot's pick. The search summaries carry each feat's prerequisites so the
list needs no per-feat fetch.

The **spells** step is for casters (`spellPlan.ts` reads the class's casting
table). It lists the cantrips and the rank 1 spells of the class's tradition
(compendium search by `tradition`, `trait=cantrip` and `rank=1`) as checkboxes,
each name a tooltip, and counts the cantrips against the class's ("3 of 5
chosen"). The rank 1 heading says what the picks are for: spells you know
(spontaneous), your spellbook (Wizard) or spells to prepare from (other prepared
casters). Another tradition's list can be chosen from a menu and picked from,
with a note that it is not the class's own. A Witch's list follows the patron
chosen ("Your patron gives you the Occult list"); before the patron is chosen,
or for a Sorcerer, whose bloodline the app cannot map yet, the step asks for the
list that goes with the choice. Picks go in `build.spells` ([spellcasting.md](spellcasting.md)).
More cantrips than the class has is counted in words and warned about on
review; nothing is refused (ADR 0023). A spontaneous caster's rank 1 picks are
counted against its repertoire, which holds as many spells as it has slots ("1 of
2 chosen" for a Bard); a prepared caster's are not counted yet. Above the lists,
"Your class also gives you" names what the class grants by itself
(`classSpells.ts` in the PF2e system): for a Bard, Courageous Anthem, Counter
Performance, 1 Focus Point, and its muse's spell once the muse is chosen (until
then a note says the muse will add one); for a Cleric, its Divine Font, "4 extra
slots at your highest rank, each holding Heal" (or "Heal or Harm, once you choose
your font" before the choice); for a Witch, 1 Focus Point and, once the
patron is chosen, its hex cantrip and the familiar's spell. Picks the class asks for
between named spells (a Witch's first hex, a Wilding Steward's familiar spell) are radio
buttons there, stored in `build.classChoices`; one left unmade is on the review's list. These are not counted against the
picks. A class that does not cast says so.

The **review** step shows the whole character in words (what is chosen and
what is not, the attribute modifiers, class choices, extra skills, feats,
equipment and what it cost) and a "Things to check" list: every warning the
derivation raised, as a sentence (`reviewModel.ts`). Nothing there blocks
**Create character**. A missing-entry warning is not shown, because the preview
has no compendium to look entries up in; the server looks them up for real.

### Creating the character
`createCharacterFromDraft` (`createCharacter.ts`) runs the operations in order:
`actor.create` with the name ("New character" if blank), a wait for the new
actor to arrive (the server picks its id), `actor.applyBuild` with the composed
build (`buildOf`: the picks plus the boosts and flaws the entries add up to) and
the key attribute, `actor.addItem` for each piece of equipment, and
`actor.adjustCoins` with the change. The client sends only choices and the names
of compendium entries. If a later step is refused the character already exists,
so the result names the step, the draft is forgotten (a second Create would make
a duplicate), the sheet opens, and the player finishes there; if the create
itself is refused nothing was made and the choices are kept. On success the
draft is forgotten, the creator closes and the new character's sheet opens.

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

The **equipment** step (`EquipmentStep.vue`, `equipmentPlan.ts`) browses
weapons, armor and gear from the compendium (by kind and name, with prices from
the search summaries) and keeps a shopping list with quantities and a running
total against the purse: "Spent 1 gp 2 sp of 15 gp. You keep 13 gp 8 sp."
Going over the purse is a warning that says to check with the GM, and an item
with no known price counts as free and is named. The list is kept in the
creator's draft, not in the build record, because gear is not something the
derivation grants; when the character is created the creator adds each item
(`actor.addItem`) and gives the change (`actor.adjustCoins`), and a character
that went over gets no change rather than negative coins. Amounts are shown as
gold, silver and copper (a starting purse reads as "15 gp", not "1 pp 5 gp").
Items are not limited by level here **(confirm)**.
