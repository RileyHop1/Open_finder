# 0008. Modifier resolution: compute an explained total, never a bare one

- **Status:** Accepted
- **Date:** 2026-09-28
- **Relates to:** ADR 0004 (rule elements produce modifiers; this consumes them)

## Context
Every number the app displays — AC, saves, skill bonuses, attack rolls, DCs,
speed, HP — is the result of the same computation: gather the modifiers that
apply, discard the ones PF2e's stacking rules suppress, and sum what remains.

PF2e's stacking rules are specific:

- **Circumstance, status, and item** are typed bonuses. Only the **highest** of
  each type applies; the rest are suppressed.
- The same three types exist as **penalties**. Only the **worst** of each type
  applies.
- **Untyped** bonuses and penalties all stack, with each other and with typed ones.
- **Proficiency is not a bonus type.** It is level + rank (trained 2, expert 4,
  master 6, legendary 8) and is never suppressed by a typed bonus.
- The ability modifier is likewise not a stacking type.

Two of the project's signature features are views onto this machinery. "Show the
math" (Player experience) means clicking any number and seeing where each piece
came from. "Combat log with breakdowns" (North star) means the same for rolls.

The tempting implementation is a function that returns a number, plus a separate
function that builds an explanation. That is the design this ADR exists to
prevent: two code paths computing the same thing drift, and the one that drifts
is the explanation, which means the app confidently shows a breakdown that does
not sum to the number beside it.

## Decision
**One resolver, returning both the total and the full modifier list with each
entry marked applied or suppressed.**

1. A **`Modifier`** is a record: `{ slug, label, type, value, source, predicate?,
   enabled }`. `type` is one of `circumstance | status | item | untyped |
   proficiency | ability`. `source` names the item, feat, condition, or spell it
   came from, so the breakdown can link back to it.
2. A **`Statistic`** is the resolved result: `{ total, modifiers: ResolvedModifier[] }`
   where each `ResolvedModifier` carries the original plus `applied: boolean` and,
   when suppressed, `suppressedBy: slug`.
3. **Suppressed modifiers are retained, never filtered out.** They are the answer
   to "why isn't my +2 showing up" — the UI can say *"+2 status (Heroism), not
   applied: superseded by +3 status (Bless)"*. Discarding them makes that question
   unanswerable and is the main reason to keep suppressed entries around.
4. **There is no second code path.** The number rendered on the sheet and the
   breakdown shown on click come from the same `Statistic`. Rendering a total
   without its modifier list is not possible, because the resolver does not return
   one.
5. **Rule elements emit `Modifier` records** (ADR 0004) rather than mutating
   statistics directly. A feat does not "add 1 to Athletics"; it contributes a
   modifier that the resolver may or may not apply.
6. **Predicates are evaluated at resolution time** against the current roll
   options, so conditional modifiers ("+1 circumstance when flanking") resolve per
   roll rather than being baked into a stored value.

## Consequences
- **The breakdown UI is free**, and correct by construction. It cannot disagree
  with the number because it is the same object.
- **"Why isn't this applying?" becomes answerable**, which is the exact question a
  player asks a GM at the table. This is the single best argument for the design
  and it falls out of keeping suppressed entries.
- **Every statistic is a resolver call**, including ones that look trivial today.
  A hardcoded `10 + dexMod + proficiency` for AC is a shortcut that will have to be
  unwound the first time an item bonus appears. Do not take it.
- **Resolution happens on every roll, not once at save time.** Predicates depend on
  transient roll options (flanking, off-guard, target traits), so statistics cannot
  be cached to the document. The cost is small; the correctness is not optional.
- **The `Modifier` shape is a schema in `packages/core`** and therefore migration-
  bearing. Changing it changes stored rule elements, so get `type` and `source`
  right early — those two are the hardest to add retroactively.
- **Golden tests gain a second job.** They already pin totals; they should also pin
  which modifiers were suppressed, so a stacking-rule regression fails loudly
  rather than silently producing the same total by a different route.

## Alternatives considered
### Return the total; build the explanation separately
The conventional split, and simpler to write the first time. Rejected: the two
paths drift, and the failure mode is the worst available — a breakdown that does
not add up to the number next to it, shown to a player who trusted it. The whole
"show the math" promise depends on the explanation being the computation, not a
reconstruction of it.

### Filter suppressed modifiers out during resolution
Cleaner return value, less memory. Rejected: it discards exactly the information
that makes the feature useful. "Your +2 is being superseded by a +3 of the same
type" is the answer people need; "here are the modifiers that applied" is not.

### Bake statistics into the actor document on write
Would make reads trivial and sheets fast. Rejected: conditional modifiers depend
on roll-time state (flanking, target traits, active conditions) that does not
exist at write time, so the stored value would be wrong for exactly the cases
that matter most in combat.

### Hardcode stacking per statistic
Each of AC, saves, and skills applies the rules itself. Rejected as the same
class of mistake ADR 0004 rejects for rule elements: one rule implemented in a
dozen places is one rule implemented a dozen slightly different ways.
