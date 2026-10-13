# 0025. Spellcasting: entries on the character, class tables of our own, slots tracked and never enforced

- **Status:** Accepted
- **Date:** 2026-10-13
- **Relates to:** ADR 0004 (rule elements), ADR 0006 (core four books), ADR 0008
  (modifier resolution), ADR 0014 (actor shape, embedded item copies), ADR 0023
  (calculate, don't enforce), ADR 0024 (character build record)

## Context
Milestone 8(b) adds the seven casters (Bard, Cleric, Druid, Witch, Wizard,
Oracle, Sorcerer). Today a spell is a compendium entry with a rank, traditions
and prose (`spellEntrySchema`), and a character can carry spell items, but
nothing says which spells it can cast, how many times, or with what bonus. The
sheet's Spells tab is a placeholder.

Checked against the pinned upstream data:
- A class carries **only a flag** (`spellcasting: 1`, the starting proficiency
  rank). There is **no slot table, no repertoire size, no tradition and no
  prepared-or-spontaneous field**. All of that exists only in prose
  ("You are a spellcaster, and you can cast spells of the divine tradition...").
- The tradition of a Sorcerer or Witch comes from a choice (bloodline, patron)
  that the importer now maps (ADR 0024's class choices), not from the class.
- The Foundry model stores spellcasting as embedded entry items with spells
  pointing at them. Our data model must not depend on Foundry's format
  (CLAUDE.md, Rules data).

Forces:
- **The math is the product.** Slots by rank, how many are left, the spell
  attack and spell DC are exactly the arithmetic a player gets wrong by hand.
- **Calculate and offer, never enforce** (ADR 0023). Running out of slots,
  casting a spell you do not have prepared, or a rank you cannot reach is a
  ruling for the table, not a refusal.
- **Usage must persist.** Slots spent and spells prepared change during play and
  survive reloads, so they cannot be derived on read.
- One build skeleton and the core four books (ADR 0006): no Psychic, Animist,
  Thaumaturge or other later-book casters.

## Decision
1. **A character holds spellcasting entries.** `system.spellcasting` is an
   optional list (default empty, so old characters need no migration) of
   entries. An entry has a tradition, a kind (`prepared` or `spontaneous`; focus
   and innate casting follow in their own PRs), the casting attribute, and its
   own state: slots per rank (`max` and `used`), the prepared spells per rank
   (prepared casters), the repertoire (spontaneous casters), signature spells,
   and the cantrips. A character with two ways of casting (a Wizard with a
   multiclass dedication, later) has two entries.
2. **Focus points are a character-level pool** (`focusPoints: { max, current }`,
   at most 3), not part of any entry, because the pool is shared across every
   source of focus spells.
3. **Spells stay ordinary `spell` items on the character**, embedded copies
   under ADR 0014 like every other item. An entry refers to them by item id
   (`{ rank, itemId }` for a prepared slot, a list of item ids for a repertoire).
   Removing a spell uses the existing item removal; the same spell prepared
   twice is two slot rows pointing at one item.
4. **The class tables are our own authored data**, because upstream has none
   (above): `systems/pf2e/src/rules/spellcastingTables.ts` holds, per caster
   class, the tradition (or the choice that decides it), kind, casting
   attribute, cantrips and slots per rank by level, and repertoire size. Every
   number is marked **(confirm)** in `docs/rulings.md` until checked against
   Archives of Nethys, and each class has a golden test that pins its slots at
   several levels (CLAUDE.md: one character of each class).
5. **The derivation proposes the static parts.** `deriveCharacter` (ADR 0024)
   reads the class, its tables and the class choices, and returns the entries'
   tradition, kind, attribute and slot *maximums* for the level. The build
   records the spell *picks* (cantrips, the first spells, a Wizard's book), which
   the derivation grants as items. `used` and the prepared lists are play state:
   the derivation never overwrites them, and level-up only raises maxima.
6. **Slots and focus points are tracked, shown and never enforced.** Casting is
   one operation that spends a slot (or a focus point) and posts a chat card; it
   never refuses. Spending past the maximum reads "-1 slot" with a marker. The
   GM can set any count by hand, and refocus and daily preparation are buttons.
7. **Spell attack and spell DC are `Statistic`s** (ADR 0008): the casting
   attribute, the spellcasting proficiency rank (separate from the class DC) and
   level, with a breakdown like every other number on the sheet.
8. **Heightening and spell effects are not automated.** A spell is cast at a
   chosen rank; the card shows the matching heightened text and the save DC, and
   the table applies the result with the existing damage and condition buttons.

## Consequences
- The Spells tab becomes real: slot pips per rank, the prepared or known list,
  Cast buttons, the focus pool, spell attack and DC with breakdowns.
- Eight PRs can follow independently of one another once the schema, statistics
  and cast operations exist: one per caster class for its wizard step.
- We own a set of tables that can be wrong. They are small, written once, marked
  **(confirm)**, and pinned by goldens, so a correction shows up as a failing
  golden value rather than a silent change.
- Casting a spell the character does not have, or at a rank with no slots, is
  allowed and shown. That is the intended behaviour (ADR 0023), not a gap.
- Rituals, staves and wands stay as items; no new casting subsystem for them.

## Alternatives considered
- **Spells as plain items with no slots.** Rejected: it costs nothing and leaves
  the one resource a caster spends every round on paper, which breaks the
  promise that the math is handled. The Spells tab would be a glossary.
- **Anonymous resource counters for slots** (the same mechanism as reagents or
  focus points). Rejected for slots: a counter cannot say *which* spell is
  prepared in a slot or which slot is spent, which is the whole of preparation.
  A counter is still the right shape for the pools that have no list behind them
  (focus points here; reagents and vials in stage 8(c)).
- **Derive slots and usage on read from the build.** Rejected for the reason in
  ADR 0024: usage changes during play and must persist, and a re-import must not
  change a running campaign.
- **Copy Foundry's embedded spellcasting-entry items and `location` pointers.**
  Rejected: it ties our data model to Foundry's format (CLAUDE.md, Rules data),
  and importing the entries would still leave the tables unfilled, since the
  upstream class carries none.
- **Refuse a cast with no slot left.** Rejected: contradicts ADR 0023. A table
  may allow it, and the person clicking makes the ruling.
