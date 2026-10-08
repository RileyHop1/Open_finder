# 0024. Character build: store the choices beside the numbers, derive by a pure function

- **Status:** Accepted
- **Date:** 2026-10-08
- **Relates to:** ADR 0006 (core four books, one build skeleton), ADR 0008
  (modifier resolution), ADR 0014 (actor shape), ADR 0023 (calculate, don't
  enforce)

## Context
Milestone 8 adds a character creation wizard and level-up. Today a character
is its numbers: attribute modifiers, explicit proficiency ranks, HP inputs and
embedded items (ADR 0014). Nothing records *why* a character has them, so
nothing can answer "what did the player pick at level 5?", and level-up cannot
tell a number the build produced from one a GM changed by hand.

Three forces:
- **Hand-building must keep working.** The sheet is editable and the GM can
  override any number (ADR 0023). A character with no build at all stays valid.
- **The server is authoritative and never trusts entry content from a client**
  (ADR 0014 decision 3).
- **One build skeleton** (ADR 0006): no Free Archetype, Dual-Class or
  Automatic Bonus Progression.

## Decision
1. **A `build` record is stored on the character beside the explicit values.**
   It holds only *choices*: ancestry, heritage, background and class
   references; the key attribute; attribute boosts per source and per level
   (1, 5, 10, 15, 20); skill picks and increases by level; feats by slot;
   languages; and class-specific choices. It is optional on
   `characterDataSchema`, so existing characters need no migration.
2. **`deriveCharacter(build, entries, level)` is a pure function** in
   `systems/pf2e`. It *proposes* attribute modifiers, ranks, HP inputs, speed
   and granted items from the build and the compendium entries. It has no
   side effects and does no I/O.
3. **The server applies a build in one operation** (`actor.applyBuild`). It
   copies every entry from its own compendium, runs the derivation, and writes
   the build, derived values and items in one transaction. A client sends
   choices only. Fields the caller names in `keep` are left as they are.
4. **The explicit values stay the source of truth for play** (ADR 0014
   decision 4). The build is a record and a proposal, not a second source.
   Rolls never read the build.
5. **Rules problems are warnings, never refusals** (ADR 0023). Boosting one
   attribute twice from a single source, a feat whose prerequisite is not
   met, or an over-budget purchase is shown with a visible warning and
   allowed. The derivation returns `warnings`; the operation does not reject.
6. **Level-up is a diff.** `levelUpPlan` derives at the new level and
   compares against the stored values. A value that differs from what the old
   build derived was hand-edited, and the player chooses per line whether to
   keep their number or accept the derived one.

## Consequences
- Hand-built characters, imports and old worlds are unaffected.
- A derived number can disagree with a hand-edited one. That is the point of
  `keep`, and level-up surfaces it rather than overwriting.
- The build duplicates information that is also in the explicit values. The
  cost is small (a few dozen references), and it is what makes level-up
  possible.
- The derivation is pure, so golden tests can check that a build for each
  class produces the same numbers as the existing hand-set goldens.
- Milestone 8's backend work (schema, boost math, derivation, search filters,
  the operation) lands before any wizard UI, per the development order.

## Alternatives considered
- **Derive everything on read from the build, store no numbers.** Rejected:
  ADR 0014 already rejected computing a character's numbers from compendium
  entries on read, because a re-import would silently change a campaign, and
  it would make every hand override impossible.
- **Store only the results, as today.** Rejected: level-up could not tell
  what was chosen, which boosts have been spent, or which values a GM
  edited, so it would have to guess or overwrite.
- **A separate `Build` document.** Rejected: a character and its build are
  always read, copied, exported and permissioned together, and a second
  document adds a join with no benefit.
- **Make the wizard refuse invalid choices.** Rejected: contradicts ADR 0023.
  A table may allow a rule-bending pick, and the person clicking makes the
  ruling.
