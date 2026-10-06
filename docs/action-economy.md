# Action economy

How a turn works, what the app enforces, and what it merely shows.

## The rule: the budget is shown, never enforced
**Nobody is refused for spending past the turn's capacity.** The action budget
is tracked and displayed; going over it is announced, not blocked
([ADR 0023](adr/0023-calculate-dont-enforce.md), "calculate, don't enforce").

This has been through three readings. The original M5 C.4 design let anyone
overspend with a visible warning. Playtesting then found a player could keep
clicking past 3 actions with nothing stopping them, so players were capped
(refused, naming how many were left) while the GM never was. Playing the capped
version showed its own cost: PF2e has real effects granting extra actions that
no automation fully models, a refused move left a player stuck mid-turn, and
every gap in the model became a player unable to do what the table had agreed.
So the cap is gone for everyone and the original warning is back, with the
table as the referee.

**What a spend past the capacity does:** it goes through, a chat line says so
("Ada has spent 4 of 3 actions", kept from players if the combatant is
hidden), and the tray shows "⚠ 1 action over" in words. The GM can give an
action back, the same override every automated number has.

What *is* still refused is a permission question, not a rules one: who may act
on a combatant (its actor's owner or the GM), and moving out of turn while the
GM has turn-based movement on (that is the GM's own switch, see
[combat.md](combat.md)).

**Implemented in M5 C.4**: `apps/client/src/components/ActionTray.vue` shows
the acting combatant's ◆◆◆ (filled by `actionsSpent`) and ↺, both with a text
count ("2/3 actions · reaction ready"), plus a quickened extra marked
"restricted". Its **Reaction** and **Undo** buttons are for the combatant's
actor's owner or the GM; the whole tray is hidden while no combat is active.
Actions are spent from the action bar's **Spend** button, not the tray. A spend
that would cross the turn's `actionCapacity` is never refused (for anyone); it
goes through, the tray shows "⚠ +1 over", and chat announces it ("Ada has spent
4 of 3 actions"). There is no separate "give back" button: **Undo** takes back
the last step. (The server still accepts a negative `combat.spendAction`; no
button sends it.)

**Implemented in M5 C.5a**: `apps/client/src/components/ActionBar.vue`, across
the bottom of the map for whatever token is selected. A strike (its three MAP
variants precomputed from `prepareCharacter`/`prepareNpc`, the same numbers
`StrikesPanel.vue` shows) always rolls on click and, while a combat is
active, also spends 1 action. Everything else is the **generic action**
(ADR 0023, which removed the preset basic-action buttons and the GM-only
"Other action"): any seat that controls the token describes what they do,
picks a cost (Free, ◆, ◆◆, ◆◆◆, Reaction; shown only while a combat is
active), and may add dice. **Spend** spends the cost, then
posts one labelled roll or a plain chat line. It needs something to say: the button
is off until the form has an action or dice (every spend is then logged). The tray, strikes and form sit in one row.

**Situational modifiers** (ADR 0023): a row of its own under the action row (`SituationalMods.vue`) with a fixed shape: the
total, a value/label/Add group, and a **Saved (n) ▾** dropdown holding the list, so
adding one never reshapes the row. Each saved modifier in the dropdown has an on/off
checkbox, a remove button and an optional label ("Flanking"). They are saved on the actor (`actor.setQuickbar`, [actor.md](actor.md))
and follow the player to another device. Every switched-on one counts toward
every roll made from here: the strike buttons show the bonus with them added,
a strike or sheet check sends them as `modifiers` so the chat breakdown lists
each one ([operations.md](operations.md)), and the generic action's dice get
their sum added to the expression.

**The hotbar** (`ActionHotbar.vue`, `SaveToHotbar.vue`): ten slots in a **bar of their own**, a second box stacked under the action bar at the same width (a grid of equal slots that wraps to a second row when narrow, so saving or clearing one never reshapes it). The form and Save button stay on the action bar; a slot or number key loads into the form, and an empty slot's "+" saves the form there, on keys 1 to 9 then 0, saved on the actor with `actor.setQuickbar`
([actor.md](actor.md)) so they follow the player to any device. A filled slot
shows the player's own name for it and its cost. Choosing a slot (click, or its
number key when not typing) **loads it into the form** rather than running it, so
the player can switch on this time's modifiers, tweak the dice, and then press
Spend. **Save** next to Spend asks for a name (offered: the action's text) and a
slot, each slot labelled with what it would replace; with something in the form,
an empty slot also offers a "+" that saves there directly. A slot is renamed in place
(F2 or double click) and removed with its own button; nothing is hover-only. The bar itself is shown only for a
token this seat controls (the GM, any; a player, one they own) — see
`docs/combat.md` for where that check lives. Still open, as a follow-up PR
under the same C.5 item: range highlighting. Movement spending actions landed
separately, in `token.move` itself (`combat.ts`'s `spendMovement`,
[combat.md](combat.md)) rather than on this bar, since a move is dragged on
the map, not clicked here.

**Implemented in M5 C.5b, redesigned under ADR 0019**: "Undo" on
the action tray sends `combat.undo` (owner-or-GM, same as the tray's other
controls). It is a thin client over the server's own turn-undo stack
(`apps/server/src/turnUndo.ts`, [combat.md](combat.md), "Turn undo"), not a
client-side log: a *step* opens on the active combatant's in-budget spend and
gathers everything else that happens on that turn — a move, a strike's MAP
count, a reaction, even the GM's own damage or a condition applied in the
meantime — whoever caused it. Undoing restores every document the step
touched in one operation, which is the only way "move, and someone reacts to
it" can undo cleanly. A roll's own chat message is never part of what a step
restores, so undoing a strike puts MAP and the board back but leaves the roll
exactly as it was; a bad roll is the GM's to edit directly, not undo.

The button is always shown wherever the tray already is (owner-or-GM, a
combat active): there is no separate client-side check for "is there
something to undo," since the stack only ever belongs to whoever is
currently acting, and clicking with nothing to undo, or a player trying a
step that was not theirs, surfaces the server's refusal through the same
`combat.error` line other rejected operations use.

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
capacity rather than being special-cased in the tracker. A player spending more
than this capacity is warned about and never blocked (see "The rule: the
budget is shown, never enforced" above). See
[rulings.md](rulings.md), "Stunned, slowed, and quickened".

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

**What is surfaced today** (`apps/server/src/reactions.ts`): when a token moves out of
a square that a creature with **Reactive Strike** threatens, in an active combat on a
gridded scene, that creature's owners and the GM get a chat line ("Ada can use Reactive
Strike: Goblin moved out of their reach."). It is only offered to a character carrying the
Reactive Strike feature that is on the other side from the mover (party versus everyone
else), able to act, and with its reaction unused. Reach is natural reach, and a monster
is not offered it (a creature entry has no abilities list yet). A mover the table cannot
see is "a hidden creature". The reaction itself is never spent for the player.

Triggers we cannot detect are simply not surfaced. A missing prompt is acceptable;
a wrong automatic reaction is not.

**Implemented in M5 C.10.** The prompt is an ordinary chat message, so it needed a
distinct, inline rendering to actually read as a notice rather than a line of
dialogue — as written, its `seatId` is the *mover's* seat (whoever triggered it),
not the reactor's, so the chat log's usual "Name: text" would misattribute it.
`apps/client/src/components/chatNotice.ts`'s `isPrivateNotice` detects it
structurally (a `text` message naming specific seats, never by matching its
wording — the only other private aside, a template's hidden-catch line, names no
one), and `ChatLog.vue` renders it as a bordered "Notice: ..." line with no sender
name, still an ordinary row in the same always-visible log, never a popup.
Wiring a direct "spend reaction" button onto this specific notice is **out of
scope**: the prompt carries no structured link to a combatant, and adding one is a
schema/server change, not a client-only item. The existing `ActionTray.vue`
"Spend reaction" toggle remains the manual follow-through.

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
