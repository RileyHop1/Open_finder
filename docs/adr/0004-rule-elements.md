# 0004. Rule elements: our own schema, a mapped v1 subset, inert fallback

- **Status:** Accepted
- **Date:** 2026-09-28

## Context
CLAUDE.md makes two commitments that pull against each other:

- **"Rules automation is data-driven."** A feat that grants +1 to Athletics is
  data, not code. Hardcoding logic per feat does not scale past a few dozen
  entries, and PF2e has thousands.
- **"Our data model must not depend on Foundry's format."** ADR 0003 imports
  upstream content, but the schema must be ours.

The tension is that upstream's automation *is* Foundry's rule-element format:
roughly forty element types (FlatModifier, DamageDice, RollOption, GrantItem,
ChoiceSet, Note, TokenLight, and so on), each with its own semantics, predicate
language, and ordering rules. That format is not incidental metadata we can
discard — it is the entire reason the upstream data is worth importing.

Three honest positions exist, and all three have real costs:

1. Adopt Foundry's rule-element format directly. Breaks the second commitment and
   inherits design decisions we do not control.
2. Define our own format and convert. Requires reimplementing a compatible subset
   of the semantics, which is the hard part regardless of schema shape.
3. Hand-author automation ourselves. Does not scale; the same infeasible option
   rejected in ADR 0003.

This is the highest-risk decision in the project. Getting it wrong means either
rewriting the rules engine or shipping wrong numbers, and a wrong number the
player trusts is worse than a visible gap.

## Decision
**Option 2, scoped narrowly.**

1. **Our own rule-element schema lives in packages/core**, defined in Zod and
   versioned with the rest of the document model. It is informed by Foundry's
   design, because that design is good, but it is ours to change.
2. **v1 implements a deliberately small subset**, chosen to cover what a real
   table hits most turns:
   - **flat modifiers** — typed bonuses and penalties to a statistic
   - **damage dice** — adding or replacing dice on a strike or spell
   - **roll options** — tags that other elements and predicates can test
   - **granted items** — a feat that gives you another item or feature
   - **choice sets** — a feat that asks the player to pick something
   Predicates are supported only as far as these five need them.
3. **The importer maps upstream types onto ours** and is the only place that knows
   Foundry's format exists. Nothing downstream of the importer may.
4. **Unmapped automation imports inert and flagged.** The item still imports, with
   its rules text intact, marked on the sheet as "automation not applied." The GM
   applies it by hand. Never silently dropped, never silently approximated.
5. **The importer emits a coverage report** listing every element dropped or
   downgraded, grouped by type and counted. That report — not guesswork — decides
   which element types to support next.
6. **A spike validates the subset before milestone 3 gets a PR breakdown.** Map a
   few hundred real entries, read the coverage report, and confirm the five chosen
   types actually carry the weight before building on the assumption.

## Consequences
- **Coverage becomes a number we can watch.** The report turns "does our
  automation work" from a vibe into a metric, and makes the next milestone's
  scope an evidence-based decision.
- **Some items need hand-authored automation**, and some will stay inert
  indefinitely. The inert-and-flagged fallback makes that honest rather than
  invisible, and it composes with the GM override requirement in CLAUDE.md: the
  manual path already has to exist, so an inert item is a supported state rather
  than a broken one.
- **The importer becomes the most complex piece of the project** after the canvas,
  and the mapping layer needs revisiting every time the subset grows. That
  complexity stays contained in one place by rule 3, which is the main benefit of
  not adopting Foundry's format wholesale.
- **Our schema will drift from upstream's**, so re-imports are not mechanical
  forever. Each upstream pin bump may need mapping changes — one more reason
  re-importing is a reviewed PR (ADR 0003).
- **Golden tests are the safety net.** Every mapping change runs against the
  golden set, so a subtle semantic difference in how we apply a modifier fails CI
  instead of reaching a table.
- **We are committing to being permanently behind upstream** on automation
  breadth. Accepted: correct-and-incomplete beats complete-and-wrong for a tool
  whose whole pitch is that the rules are handled for you.

## Alternatives considered
### Adopt Foundry's rule-element format directly
By far the least work, and re-imports would be nearly free. Rejected because it
inverts the dependency the architecture is built on: the core engine is supposed
to be system-agnostic, and baking one system's automation format into it makes
the "PF2e is a plugin" boundary fiction. It also ties our data model to decisions
made by a project we cannot influence.

### Interpret upstream rule elements at runtime via a compatibility layer
Keeps our schema clean on paper while still running their format. Rejected: it is
the same coupling with an extra layer of indirection, and it puts a
reimplementation of forty element types on the critical path of every roll.

### Support all forty element types in v1
Rejected as scope suicide. It is a milestone-sized project on its own, and most of
the types (lighting, token images, aura visuals) serve features already listed in
Not in v1.

### Drop items whose automation we cannot map
Simpler than the inert-and-flagged state, and keeps the data "clean." Rejected: it
would quietly remove feats players legitimately chose, making the app look like it
lacks content when it actually lacks automation. Those are different problems and
the UI should say which one it is.
