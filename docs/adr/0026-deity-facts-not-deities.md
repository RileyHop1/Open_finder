# 0026. Enter a deity's facts on the build instead of importing deities

- **Status:** Accepted
- **Date:** 2026-10-23
- **Relates to:** ADR 0003 (rules data licensing), ADR 0006 (core four books), ADR 0023
  (calculate, don't enforce), ADR 0024 (character build record)

## Context
A Cleric and a Champion serve a deity, and a handful of the deity's facts change the
numbers: its divine skill is trained, its divine font decides a Cleric's font and a
Champion's devotion spell, its sanctification decides which Champion causes fit, and its
favored weapon matters to a Warpriest and a Champion's deific weapon.

Checked against the pinned upstream data (2026-10-23): the `deities` pack credits **every**
deity to a book outside the core four. 340 are Lost Omens Divine Mysteries, which CLAUDE.md
excludes by name, and the rest are adventures, the blog and other Lost Omens books. That
includes the deities Player Core itself lists. ADR 0006's publication allow-list therefore
imports none.

## Decision
No deity is imported. The build carries the deity's facts, entered by the player from
their deity's entry: `build.deity` is `{ name?, font? (heal, harm or either), skill?,
sanctification? (holy, unholy or none), weapon? }`, every field optional. The creator asks
for them in the class choices step for a class that serves a deity (`DEITY_CLASS_SLUGS`:
Cleric, Champion). The derivation (`rules/deity.ts`) trains the divine skill like a class
feature's skill (a skill already trained gives one more pick), warns when a Cleric's font
is not one the deity grants, and asks for the facts when none are entered. Nothing is
checked against a deity list, and nothing is refused (ADR 0023).

## Consequences
- The content scope holds without an exception, and no table of Paizo's deity entries is
  committed.
- A player types four facts once at creation instead of picking from a list; a typo is
  theirs to fix, like any hand-entered value. The facts sit in the build record, so
  re-applying the build (and level-up) keeps them.
- The app cannot offer a deity picker, show a deity's domains or edicts, or check a
  sanctification against the deity. Those stay at the table.
- If deities ever come into scope, a picker can fill the same `build.deity` facts, so
  the derivation does not change.

## Alternatives considered
### Allow-list the Player Core deities from Divine Mysteries
Import only the deities Player Core also lists, from the Divine Mysteries entries. Rejected:
it breaks "excluded content is excluded whole", needs ADR 0006 to carry per-entry
exceptions, and the Divine Mysteries entries carry that book's text and rules, not Player
Core's.

### Author our own deity table
Write the facts for the Player Core deities into the repository. Rejected: it reproduces a
table of Paizo's deity entries in a public repository, which the "never commit Paizo
content" rule exists to prevent, and it would have to be kept in step with errata by hand.
