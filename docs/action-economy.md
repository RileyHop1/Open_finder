# Action economy

How a turn works, what the app enforces, and what it merely shows.

## The rule: display and warn, never block
**The app shows action costs, warns visibly on an overspend, and lets it
through.** It does not prevent a fourth action.

This resolves a genuine tension in the north star. Owlcat's games hard-block,
because a single-player CRPG owns every rule. Ours does not: "the GM is the
director and can always override the automation" is a ground rule, and PF2e has
real effects that grant extra actions in ways no automation will fully model.

Blocking would mean that every time the automation is wrong, the table is *stuck*
— and the GM's workaround is to disable automation entirely, which is worse than
a warning they can ignore. A visible warning teaches new players the limit (the
stated north-star goal) without making the software the final authority.

The warning is not a modal. It is an inline marker on the turn's action tray, in
text and icon, never color alone (see Accessibility).

## A turn
- **3 actions**, spent in any combination.
- **1 reaction**, refreshed at the start of your turn.
- **Free actions**, unlimited except by their own triggers.
- Activities cost 1, 2, or 3 actions and are shown as ◆, ◆◆, ◆◆◆; reactions as ↺
  and free actions as ◇. Icons always carry a text label or `aria-label`.

**How many actions a turn has** is `actionCapacity`
(`systems/pf2e/src/rules/actionCapacity.ts`), from the conditions the combatant bears:
- **3** actions, then **quickened** adds one and **slowed N** removes N, never below 0.
- The quickened extra action is **restricted** to particular uses the app cannot
  judge, so it is shown as "restricted" and never enforced.
- **Stunned N** is not part of the capacity: it takes actions at the *start* of the
  turn and then wears off by that many, so `startOfTurn` applies it (up to what the
  turn has, after slowed) and the lost actions **count as spent**. The tray shows
  them used, and nothing about the schema changes.

All of these are conditions (see `docs/conditions.md`) and change the tray's
capacity rather than being special-cased in the tracker. Spending more than the
capacity is warned about and never blocked. See [rulings.md](rulings.md), "Stunned,
slowed, and quickened".

## Multiple Attack Penalty
MAP is the most-used piece of combat math in the game and the easiest to get
subtly wrong.

- The **second** attack in a turn takes **−5**; the **third and later**, **−10**.
- A weapon with the **agile** trait uses **−4 / −8** instead.
- MAP counts **attacks**, not actions, and resets at the **start of your turn**
  **(confirm: the reset point is implemented as the start of
  your own turn, and reaction attacks are not counted; see `docs/rulings.md`, "The
  Multiple Attack Penalty resets at the start of your own turn")**.
- The penalty applies to attack rolls only, never to damage or to DCs.
- MAP is an **untyped penalty** in the modifier system (ADR 0008), so it stacks
  with everything and is never suppressed.

The tracker maintains the per-turn attack count (`attacksMade` on the combatant): while a combat is active, `actor.rollStrike` without an `attackNumber` takes it from there and counts the attack, and an `attackNumber` that is given is the override and counts nothing; the strike UI shows the three
variants (no MAP, second, third) as separate clickable entries with their totals
already computed, so a player never does the arithmetic. This is the single
clearest example of "the rules are handled for you" in the whole app.

## Reactions
The app **surfaces** a reaction when its trigger fires — "Attack of Opportunity
is available" — and **never spends it automatically**. Auto-spending a reaction
takes a real tactical decision away from the player, which is the opposite of
what this project is for.

Triggers we cannot detect are simply not surfaced. A missing prompt is acceptable;
a wrong automatic reaction is not.

## Exploration and downtime
Outside encounter mode there is no three-action economy. Encounter mode is the
GM's switch: it exists only while a combat is active, and movement is
unconstrained otherwise ([combat.md](combat.md), "Turn-based mode is the GM's
switch"). Exploration activities
and downtime activities are their own modes — see the Game flow section of
CLAUDE.md, and milestones 13 and 14.

## Testing
- MAP at attack 1, 2, 3, 4 with and without `agile`.
- MAP resets at turn start; verify it does not reset on a new round mid-turn.
- Slowed and quickened change the available action count correctly.
- Overspending produces a warning and still resolves the action.
