# Action economy

How a turn works, what the app enforces, and what it merely shows.

## The rule: a player is capped, the GM never is
**A player cannot spend past the turn's capacity; the GM always can.**

The original M5 C.4 design let anyone overspend, with a visible warning instead
of a block, reasoning that PF2e has real effects granting extra actions no
automation fully models, and that blocking would leave the table stuck whenever
the automation guessed the capacity wrong. Playtesting found the opposite
problem in practice: a player could keep clicking past 3 actions with nothing
stopping them, which read as broken rather than permissive, and a warning
nobody was watching for didn't actually teach the limit it was meant to teach.

**The resolution keeps the GM escape hatch and removes the player one.** The
GM is still never blocked (CLAUDE.md's "the GM is the director and can always
override the automation"): if a real effect the importer or the rules engine
doesn't model grants someone an extra action, the GM spends it for them, or
adjusts the result directly, the same override path every other automated
number already has. A player hitting the cap sees a refusal naming how many
actions are left, not a silent no-op and not a warning they can click past.

The refusal is not a modal. It is the same inline error line
(`combat.error`) other rejected operations in this view already use (see
`TableView.vue`), next to the turn controls below the map.

**Implemented in M5 C.4**: `apps/client/src/components/ActionTray.vue` shows
the acting combatant's ◆◆◆ (filled by `actionsSpent`) and ↺, both with a text
count, plus a quickened extra marked "restricted". Spend/undo and the reaction
toggle are for the combatant's actor's owner or the GM; hidden entirely while
no combat is active. The server (`combat.spendAction`) refuses a player's
spend that would cross the turn's `actionCapacity` and writes nothing; the
GM's own overspend still goes through and is only announced in chat ("Ada has
spent 4 of 3 actions").

**Implemented in M5 C.5a**: `apps/client/src/components/ActionBar.vue`, across
the bottom of the map for whatever token is selected, strikes and basic
actions alike. A strike (its three MAP variants precomputed from
`prepareCharacter`/`prepareNpc`, the same numbers `StrikesPanel.vue` shows)
always rolls on click and, while a combat is active, also spends 1 action. A
basic action (`BASIC_ACTIONS`, `systems/pf2e/src/content/basicActions.ts`)
only ever spends, and the whole basics list is hidden with no combatant to
spend against. The GM alone gets "Other action", a free-text entry with a
cost picker for whatever the table asks for that the system doesn't model;
spending it names it in a chat message. The bar itself is shown only for a
token this seat controls (the GM, any; a player, one they own) — see
`docs/combat.md` for where that check lives. Still open, as a follow-up PR
under the same C.5 item: range highlighting. Movement spending actions landed
separately, in `token.move` itself (`combat.ts`'s `spendMovement`,
[combat.md](combat.md)) rather than on this bar, since a move is dragged on
the map, not clicked here.

**Implemented in M5 C.5b**: "Undo last action" on the bar
(`stores/combat.ts`'s `turnLog`, a per-combatant stack kept only in the
browser, never sent or saved). Every bar spend — a strike's action cost, a
basic action, the freeform entry — is recorded once the server accepts it;
undoing pops the most recent one and gives those actions back
(`combat.spendAction` with a negative count, same op `ActionTray`'s own
undo already used). The stack is cleared, not kept, the moment the active
combatant changes (`combat.nextTurn`/`previousTurn`), so a spend from a
turn that already ended is never undoable from here — consistent with
`combat.previousTurn` not undoing boundary-rule effects either; the GM sets
those by hand.

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
than this capacity is refused outright; the GM's own overspend is warned about
and never blocked (see "A player is capped, the GM never is" above). See
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
