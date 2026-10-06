# 0023. Calculate, don't enforce

- **Status:** Accepted
- **Date:** 2026-10-06

## Context
The charter promised "the rules handled for you", and milestones 3–5 read that
as *simulation*: the server refuses a Stride that would exceed the
combatant's remaining actions (`docs/action-economy.md`), the action bar
offers one preset button per basic action (`BASIC_ACTIONS`), and only the GM
gets a free-text "Other action" for anything else.

Playing it showed the cost. A player who moves past their budget gets a
refusal (and, before `fix/move-error-toast`, a grey box over the whole map)
for something any human GM would wave through or rule on in a second. Every
action the system does not model has to go through the GM. Each new rule we
try to enforce adds edge cases, and a solo maintainer cannot close all of
them across sixteen classes.

Foundry VTT's PF2e system, the most widely used PF2e table, draws the line
differently:
- **Core is a toolkit, not a referee.** It provides documents, tokens,
  scenes, chat, a free-form dice roller, and templates. Its combat tracker
  handles initiative order and turns, and nothing more: it never enforces
  the action economy or movement.
- **The system calculates.** Rule elements compute statistics and modifiers.
  Rolls get a degree of success against a targeted DC, and immunities,
  weaknesses, and resistances are worked out when damage is applied.
- **People apply.** The roll dialog lets the roller add situational
  modifiers. Damage is applied by clicking full, half, double, or heal on
  the card. Conditions are dragged on.
- **Nothing is refused on rules grounds.**

## Decision
**Calculate and offer; never enforce.**
1. **Automate arithmetic.** That covers statistics, modifiers (ADR 0008),
   degree of success against a known DC, damage totals, and Bulk: the things
   a person would otherwise add up by hand.
2. **Offer application as one explicit click.** The person clicking is the one
   making the ruling.
3. **The server never rejects an operation because a rule says no.** Action
   budgets, movement, prerequisites, and encumbrance are tracked and
   displayed. An overspend is shown ("−1 action", in words and with a
   marker), never refused. Permission checks (who may act on which document)
   stay exactly as they are, because they protect the table, not a rule.
4. **Every seat gets a generic action:** a description, a cost, optional dice,
   and an optional situational modifier. It posts one labelled card and spends
   its cost. Anything unmodelled goes through it, and that is the expected
   path, not a fallback. The preset per-basic-action buttons are removed from
   the action bar, and so is their data (`BASIC_ACTIONS`): the action bar was
   its only caller, so keeping it would be dead code. Encyclopedia tooltips
   read the imported `actions` pack, not that list.
5. **The Owlcat north star still governs presentation:** portraits, hover to
   learn, and breakdowns on every number. It no longer governs enforcement.

## Consequences
- **Removed:** the action-budget refusals on `token.move` and
  `combat.spendAction`. **Replaced:** the action bar's preset basic-action
  buttons give way to the generic action. Each lands in its own PR.
- **Players can do things the rules say they cannot**, and only the table
  notices. That is the intended trade: the GM is the referee, and a visible
  overspend gives them what they need to rule.
- **Less to build and test.** Prerequisite enforcement in the creation wizard
  (milestone 8) becomes "valid options first, with a warning on anything
  else", not a hard filter.
- **Some automation now waits for a click** that a fully simulated game would
  apply on its own. That is one more click per effect, accepted for the sake
  of predictability.
- **ADR 0004 is unchanged**, except that rule elements compute numbers and
  never gate an action.

## Alternatives considered
### Full simulation (the previous reading of the charter)
Enforce every rule the engine models, and grow coverage until it models
everything. Rejected. It never finishes: every unmodelled feat, spell, or GM
ruling becomes a player blocked by software. It also makes the engine, not
the GM, the final word at the table, which inverts what a tabletop is for.

### Enforce by default, with a GM "off" switch
Keep the refusals, and let the GM disable enforcement per world. Rejected. It
keeps both code paths alive and tested, and the default still blocks the
table the first time anything goes wrong. A warning shows the same
information without the cost.
