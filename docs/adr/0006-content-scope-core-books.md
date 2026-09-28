# 0006. Content scope: the core four books only

- **Status:** Accepted
- **Date:** 2026-09-28
- **Relates to:** ADR 0003 (licensing sets the outer boundary; this sets a tighter
  scope boundary inside it), ADR 0004 (this shrinks the rule-element surface)

## Context
ADR 0003 restricts imports to ORC-licensed Remaster material for licensing
reasons. That still leaves a large and growing body of content: Rage of Elements,
Howl of the Wild, Battlecry!, War of Immortals, Divine Mysteries, and whatever
comes next.

The problem is not licensing and not storage. It is that **character building is
where PF2e gets messy**, and every additional release makes it worse along three
axes at once:

1. **Option space.** More classes, more ancestries, more versatile heritages,
   more archetypes. The creation wizard has to present all of it, filtered by
   prerequisite, with only valid choices shown.
2. **Prerequisite graph density.** Feats reach across books. A feat from book four
   that requires a class feature from book two and a skill proficiency from book
   one is a graph edge somebody has to model and test.
3. **Rulings surface.** Cross-book interactions are exactly where the rules get
   ambiguous, and every ambiguity is a judgment call, a golden test, and an
   eventual bug report.

The v1 goal is a playable game with a real character creation wizard. That is
only achievable against a bounded option space.

## Decision
**Import from exactly four books:** Player Core, Player Core 2, GM Core, Monster
Core. Sixteen classes, the core ancestries and backgrounds, one build skeleton.

Enforced as a **publication allow-list in the importer**, not as a convention.
Adding a book is a one-line change to that list plus a reviewed PR, which is
exactly the right amount of friction: easy to do deliberately, impossible to do
by accident.

**Also excluded, specifically:**
- **Rage of Elements, and therefore the Kineticist.** The Kineticist is the most
  automation-hostile class in the game: impulses instead of spells, elemental
  gates, and a bespoke resource system sharing almost nothing with the rest of
  the engine. It would be a rules subsystem, not a class.
- **Variant rules** — Free Archetype, Dual-Class, Automatic Bonus Progression.
  These change the *shape* of a build, so supporting them means the wizard has
  more than one skeleton. One skeleton is the thing that makes it finishable.

## Consequences
- **The creation wizard becomes achievable in v1.** This is the whole point.
  Sixteen classes is a number one person can build, test, and hold in their head.
- **Exhaustive golden coverage becomes realistic.** One golden character per class
  is sixteen fixtures, which is a small enough set to actually write and maintain.
  Against the full content list it would not be.
- **The rule-element coverage report from ADR 0004 becomes readable entry by
  entry** rather than a wall of counts. That is what makes the v1 subset choice
  verifiable instead of a guess.
- **Users will ask for their favorite class and we will not have it.** Kineticist,
  Magus, Summoner, Thaumaturge, Exemplar. The honest answer is scope, not
  licensing, and the UI should not pretend the class does not exist — better to
  say "not supported yet" than to show an empty list.
- **Excluding a book cascades.** Per ADR 0003, entries whose rules depend on
  excluded content are dropped whole, so excluding Rage of Elements also drops
  feats and items elsewhere that reference elemental mechanics. The importer's
  drop report needs to make that visible, or a missing feat looks like a bug.
- **The allow-list will need maintenance** as Paizo republishes and reorganizes
  content between printings. Pinned upstream commits (ADR 0003) mean this changes
  only when we choose to re-import.
- **This is the easiest decision to reverse in the whole set**, and deliberately
  so. Adding Player Core 3 later is an allow-list entry, an import run, a
  coverage-report read, and golden tests. Nothing architectural depends on the
  list being short — only the schedule does.

## Alternatives considered
### Import all ORC/Remaster content
Best coverage, and the licensing work in ADR 0003 already permits it. Rejected
because it makes the v1 creation wizard unfinishable: the option space, the
prerequisite graph, and the rulings surface all grow faster than a solo
maintainer can test them. Coverage we cannot verify is not a feature.

### Player Core only (8 classes)
Tighter still, and tempting. Rejected because Player Core alone has no Barbarian,
Monk, Champion, or Sorcerer — a table would immediately hit "I can't play the
character I want," and the classic four-person party is not buildable in a way
most players would recognize. Player Core 2 is what makes the set feel complete
rather than partial.

### Include content but leave its automation inert
Import everything, automate only the core books, and let the rest ride the
inert-and-flagged path from ADR 0004. Rejected: it moves the problem into the
creation wizard, which would then present thousands of options that mostly do not
work. A wizard full of choices that silently do nothing is worse than a wizard
with fewer choices.

### Support Free Archetype as a world setting
Very commonly used at real tables, so this is the exclusion most likely to be
revisited first. Rejected for v1 because a second build skeleton doubles the
wizard's state machine and every level-up path through it.
