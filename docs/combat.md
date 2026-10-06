# Combat

An encounter, and one token's place in it. `@hearthtable/core`'s `combatSchema`
and `combatantSchema` extend the shared envelope ([documents.md](documents.md)).
Why they are shaped this way is
[ADR 0018](adr/0018-combat-tracker.md); how a turn spends actions is
[action-economy.md](action-economy.md); how conditions end is
[conditions.md](conditions.md).

Milestone 5 adds the schemas first (this page), then the rules in
`systems/pf2e`, the server operations, and the tracker UI. Sections below say
which parts exist so far.

## Turn-based mode is the GM's switch
Combat only happens when the GM turns it on. Until then the table plays freely,
as it does today.

- **On means `status: 'active'`**, reached only by the GM's `combat.start`. A
  combat that is `pending` (being set up) or `ended` tracks nothing. Opening a
  battle map, placing monsters, or adding combatants never starts one.
  **Implemented in C.1b:** the turn bar's **Start combat** button is the GM's
  only button onto the wire (`combat.create` then `combat.start`, in one
  click); it is where the bar shows for the GM even before anything is
  running. The turn bar itself (`TurnBar.vue`) shows only the turn order:
  portraits, initiative, round, and the GM's per-combatant initiative
  override. The GM's **Previous turn** and **End combat**, and the shared
  **Next turn**/**End turn** button, live below the map next to the action
  bar (`TurnControls.vue`), so only turn-order facts sit above the map.
  **Players may end their own turn** when they own the active combatant's
  actor -- `combat.nextTurn` allows the GM or that owner (the server's
  `requireCanEndTurn`); everything else on `TurnControls` (**Previous turn**,
  **End combat**, free movement) stays GM-only. The **Shift+N** hotkey on the
  map surface follows the same rule.
  **Implemented in C.3:** the acting combatant's token gets a second ring on
  the map and "(current turn)" in its label; its party bar card (if it has
  one) gets the same ring and a "Current turn" line. Both clear with no
  active combat.
- **Off (no active combat):** a token moves anywhere, with no speed limit and no
  turn check. There is no turn state, no action counting, and no Multiple Attack
  Penalty from the tracker (a strike still takes an explicit attack number, as
  now). Nothing ticks, so no turn-based condition expires. This is the current
  behavior of `token.move`, and it must stay true.
- **Starting combat rolls initiative.** `combat.start` makes a combatant of every
  **party member's token and every visible token** on the combat's scene, and rolls
  each one's initiative (Perception by default) at once. A **hidden** token stays
  out until the GM adds it, so an ambush is not announced by the start; it rolls
  when added. The GM can remove any combatant, or set any initiative, before the
  first turn.
- **On: movement follows the turn.** A player can move a token only on its
  combatant's turn. The server refuses any other move (`requireTurnToMove`, shared by `token.move` and
  the live drag preview, which is dropped silently) with "it is not this token's
  turn: ask the GM to let it move". The server never names whose turn it is, since
  that may be a hidden creature; the client may name it when it can read that
  combatant. The reason is always in text, never colour alone.
  **The GM is never blocked.** A token that is not a combatant (a bystander, a
  hidden creature not yet added) is not gated.
- **A special ruling lifts it.** The GM can switch on **free movement** for the whole
  combat (a chase, a cutscene), or **let one token move** out of turn once (a
  reaction Stride, a ruling at the table). A single grant (`combat.setMovementRuling`)
  clears when that token's next turn ends, or when the GM takes it back. Both are the GM's, both are shown on the tracker so nobody is
  surprised, and the keyboard and menu routes are the same as for any GM tool.
  **Implemented in C.2b:** a Free movement checkbox in the turn bar, and a
  "Let this token move" / "Revoke movement" item in the token menu.
- **A player's actions are enforced too.** A spend that would cross the turn's
  `actionCapacity` is refused outright, naming how many actions are left; the
  GM's own overspend still goes through, with a chat warning
  ([action-economy.md](action-economy.md)).
- **Moving spends the Strides it costs, per move.** While it is the mover's
  own combatant's turn, `token.move` adds to `actionsSpent` the Strides that
  move's own distance costs on its own (`stridesFor`, from the Speed
  `speedOf` reads off the actor) -- the same budget rule as any other spend,
  so a player's move that would cross the turn's capacity is refused and the
  token does not move (the whole operation rolls back together). Each move is
  charged independently, never against a running total for the turn
  (docs/rulings.md, "Movement spends actions per move, not by a running
  total"): two short moves cost a Stride each, and one long move that outruns
  a single Speed costs more than one Stride by itself. A token that is not
  the active combatant, is not in a running combat, or whose actor's Speed
  cannot be read (a hazard) moves for free, same as always. **"Undo last
  action" undoes a move too**, along with anything else on the same step
  (ADR 0019, "Turn undo" below): `combat.undo` puts the token back and gives
  back the Strides, since restoring the token document is what moving it back
  means ([action-economy.md](action-economy.md)).
- **The keyboard route plans a move instead of sending one per cell.** Per
  move, not per cell, is the whole point of the ruling above -- so while it is
  a player's own combatant's active turn, the arrow keys (`MapView.vue`'s
  `planningMove`) trace out a path instead of moving at once: each press
  extends it from where it last landed, shown with the distance and the
  Strides it would cost beside it ("25 ft, ◆◆"), live to everyone else the
  same way a drag is (the existing preview channel, `scenes.sendDrag`).
  Enter sends the whole path as the one `token.move` it represents; Escape
  drops it, or selecting a different token does, silently. The GM is never
  gated here (CLAUDE.md's "the GM is never blocked"), so GM moves, free
  movement, and a grant-driven move out of turn all stay immediate, the same
  as a mouse drag already is for everyone -- a drag is already one
  continuous move, so only repeated key presses needed this.
- **Ending a combat** returns to free play, and the rulings go with it. What
  happens to a condition that was anchored to one of its combatants (`turn`
  durations) is decided with `combat.end` (B.3); the recommendation is that it ends
  with the encounter, since the turn it waits for will never come.

## Initiative is automatic, and the GM can reorder it
Nobody rolls by hand: initiative is rolled for you when combat starts (above) and
when a combatant joins. The **GM can change the order at will**, at any time:
drag a combatant to a new place in the turn bar, or use the keyboard route (a
"Move earlier" and "Move later" on each combatant, and a "Move before..." menu), or
set a number directly. A player cannot reorder.

**Joining after the start (C.2):** the GM's token menu offers **Add to combat**
for a token not yet in the running combat (a hidden token joining an ambush, a
monster placed mid-fight); the server rolls its initiative at once
(`combat.addCombatant` → `joinCombat`). The turn bar's drag-and-drop reorder is
not built yet (still noted above); what exists today is the **direct override**:
each combatant in the bar has a "Set initiative" number field for the GM, which
sends `combat.setInitiative` straight to the wire.

A reorder does not store a separate order. The order stays derived from initiative
([Turn order](#turn-order)), so a move **gives the combatant an initiative between
its new neighbours** (the midpoint, so 14.5 between a 15 and a 14, and one above or
below the ends). That means `initiative` is a number that may be fractional, which
is allowed by the `Combatant` schema. It was weighed against
renumbering everyone (which erases rolled values) and against a second "manual
order" field (two sort keys to keep consistent); the midpoint keeps one key and the
tie rule untouched. The turn pointer is an id, so moving someone, even the active
combatant, never moves the turn onto the wrong creature.

### How a reorder picks the numbers
`placeCombatant(sorted, moverId, beforeId)` (`systems/pf2e/src/rules/initiativeReorder.ts`)
turns "move this one before that one" (or "last") into the initiative changes that
make the derived order come out that way. It is pure and returns only what changed.

- **Room between the neighbours:** the mover takes the midpoint (14.5 between a 15
  and a 14).
- **The ends:** one above the first to go first, one below the last rolled to go last.
- **A tie:** no number lies strictly between two equal ones, so the tied group,
  mover included, is spread evenly across the gap up to the next higher initiative,
  keeping its current order and leaving its last member's number alone. A few
  neighbours' numbers change; the order is preserved.
- **An unrolled combatant** gets a number by being placed among the rolled. But a
  place *among the unrolled* cannot be chosen (they have no number to sit between),
  so the server asks the GM to roll first.
- **When it cannot:** it returns nothing for that place (after about fifty moves into
  one gap, or at the edge of the allowed range), and the server tells the GM to set
  the initiative directly. It never misorders silently.
- Moving a combatant to the place it already holds changes nothing, and moving the
  active combatant is safe: the turn pointer is an id.

## The turn bar
The order is shown as a row of **token portraits across the top of the map**, in turn
order, and it **shifts as turns pass**: the first portrait is always the combatant
with the action, and when their turn ends they move to the back of the row. It is
the party bar's counterpart for the encounter, in the spirit of Owlcat's initiative
bar.

- **Each portrait** shows the token's portrait (or its initials), the name, and the
  initiative, with the round number beside the row. The active one is larger and
  labelled "Taking their turn" in text, not only highlighted.
- **Who is shown:** a player sees only combatants they can read, so a hidden
  creature is absent from the row; if it is the one acting, the bar shows a
  "Someone is acting" placeholder in first place and nothing more. The GM sees
  everyone, hidden ones marked "(hidden)", and defeated ones dimmed and labelled.
- **It is a list, not only a picture:** an ordered list with the active item marked
  `aria-current`, each portrait a button that selects and centres that token, and
  the GM's reorder buttons and menu on the same items. Touch targets are at least
  44px, and it fits at 1024px wide by scrolling sideways.
- **Motion:** portraits slide into place; with reduced motion they simply swap.
- **Only while combat is on.** With no active combat the bar is not shown, and the
  map is just the map.
- It is HTML over the canvas, not drawn in it, so it does not touch the canvas
  budget (the perf check, D.1, covers it anyway).

**Implemented in C.1a** (`apps/client/src/components/TurnBar.vue`, fed by
`stores/combat.ts`): the row, the active label, round number, defeated and
unseen-acting placeholder, and clicking a portrait to focus its token on the
map (`MapView.focusToken`). The GM's reorder and the start/end/next-turn
controls are C.1b and C.2.

## The action bar
Across the bottom of the map, for whatever token is **selected**, not only on
that token's own turn: strikes and basic actions, both spending via
`combat.spendAction`.

- **Who it shows for:** selecting a token is unrestricted (the ruler and the
  keyboard token list both already rely on selecting anyone), but the bar
  itself is only built for a token this seat **controls** — the GM, any
  token (monsters included); a player, only one whose actor they own. This
  is the same ownership test `ActionTray`'s controls use
  (`resolvePermission(seat, actor) === 'owner'`, or `seat.isGM`), checked in
  `TableView.vue`'s `actionBar` computed, not in `MapView`'s selection logic.
- **Strikes** always roll on click; while a combat is active they also spend
  1 action. Outside combat (or for a token with no combatant yet) they still
  roll, just without the spend — the same as the sheet's `StrikesPanel`.
- **The generic action**, for every seat that controls the token (ADR 0023):
  a description, a cost (Free, ◆, ◆◆, ◆◆◆, or Reaction; the picker only shows
  while a combat is active), and optional dice with an optional situational
  modifier. It spends the cost, then posts one chat card -- a labelled roll
  when there are dice (`chat.sendRoll`'s `label`), a plain line otherwise.
  The dice are checked before anything is spent. There are no per-action
  buttons: the system does not model Stride, Interact and the rest, the table
  rules on them.

**Implemented in C.5a** (`apps/client/src/components/ActionBar.vue`,
`actionBarModel.ts`). Still open under the same checklist item: movement
spending actions.

**Implemented in C.5b, redesigned under ADR 0019**: "Undo last action" lives
on the action tray and sends `combat.undo`, backed by the server's own
turn-undo stack rather than a client-side log (see "Turn undo" above and
[action-economy.md](action-economy.md)).

**Implemented in C.5c: range highlighting.** Hovering or focusing a strike's
attack button (never only on hover, so a keyboard user gets it too) shades
every cell it could reach from the selected token red at 30% opacity, under
the tokens; losing hover or focus clears it. A melee strike threatens like
reach does (A.10's `threatenedCells`, the token's footprint size times the
scene's grid distance, plus 5 feet for a weapon's `reach` trait); a ranged
strike is a burst around the token's centre out to the weapon's `range`.
Basic actions and NPC ranged strikes (no weapon entry to read a range from)
are not highlighted — a visible gap, not a guessed number.
`apps/client/src/components/map/rangeHighlight.ts` (the pure geometry) and
`sceneView.ts`'s `setHighlightedCells` (the drawing) do the work; the
feature is purely visual and binds nothing the server enforces.

**Implemented in C.6: picking a target.** Clicking a strike's attack button
(from the bar or the sheet's `StrikesPanel`) does not roll at once -- it
waits, showing a text banner, for a target to be picked on the map or in the
keyboard token list, or for Escape to skip it and swing without one (a
decision the client makes, not the server; `targetTokenId` has always been
optional on `actor.rollStrike`, B.5). The pick sends `targetTokenId` with
the roll, whose target's AC becomes the DC as B.5 already does; the chat
card now also names who it was against, next to the DC. While a strike
waits on a target, clicking a token aims at it instead of changing the map's
own selection (`MapView`'s `targeting` prop), so aiming at an enemy never
swaps away the acting token's own action bar.

## Two documents
A `Combat` holds only where the encounter is in time. Each creature in it is a
`Combatant`, a document of its own, so a hidden monster is simply a document a
player may not read and spending one action writes one small row.

The initiative **order is never stored**. It is derived from the combatants'
initiative (and a tie rule, [rulings.md](rulings.md)), so adding a
late arrival or fixing a roll changes no other document, and the turn pointer is
an id, not a position that could drift onto the wrong creature.

## Combat fields (beyond the envelope)

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'combat'` | Literal |
| `sceneId` | UUID | The scene the fight is on. Whether it exists is the server's check, not the schema's |
| `status` | `pending` \| `active` \| `ended`, default `pending` | `ended` is kept as a record until the GM deletes it. Only one combat per world may be `active`: the server enforces that |
| `round` | integer 0-9999, default 0 | 0 until the combat starts, then 1 and counting |
| `activeCombatantId` | UUID, optional | Whose turn it is. Absent before the start and after the end. A player may not be able to read this combatant (a hidden creature acting): they are shown "someone's turn" and nothing else |
| `freeMovement` | boolean, default `false` | The GM's ruling that lifts the turn rule for everyone while it is on. The GM is never blocked either way |

## Combatant fields (beyond the envelope)

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `'combatant'` | Literal |
| `combatId` | UUID | The combat it is in |
| `tokenId` | UUID | The token that fights. A combatant is a token on a scene, so a creature with no token cannot join: the GM places one first |
| `actorId` | UUID | The actor behind the token |
| `initiative` | number, optional | Absent until rolled or set; an unrolled combatant sorts last. Any finite number from -1000 to 1000, negatives and **fractions** included: a reorder gives a combatant the midpoint between its new neighbours |
| `defeated` | boolean, default `false` | Out of the fight. Still listed for the GM, skipped by the turn order |
| `hidden` | boolean, default `false` | Whether players see it in the order. The server derives the permissions from this, never the client |
| `movementGrant` | boolean, default `false` | The GM's one-off ruling that lets this token move out of turn once. The server clears it when the combatant's next turn ends |
| `turn` | [turn state](#turn-state), default all zero | What it has used this turn |

### Turn state

| Field | Type | Notes |
| --- | --- | --- |
| `actionsSpent` | integer 0-99, default 0 | A player's spend is refused outright once it would exceed the turn's capacity; the GM's own overspend still goes through, with a chat warning ([action-economy.md](action-economy.md)). The capacity itself (3, less slowed, more quickened) is a rule, not stored |
| `reactionUsed` | boolean, default `false` | Refreshed at the start of the combatant's turn |
| `attacksMade` | integer 0-99, default 0 | The Multiple Attack Penalty counts attacks, not actions. Reset at the start of the combatant's turn |

It lives on the combatant, not the actor: it means nothing outside a fight, and
leaving a combat must leave the actor exactly as it was, apart from the real
changes (hit points, conditions).

## Turn order
`sortByInitiative`, `nextCombatant`, and `previousCombatant`
(`systems/pf2e/src/rules/initiativeOrder.ts`) are pure functions over plain
entries (`id`, `initiative`, `defeated`, `isCharacter`, `createdAt`), so the server
and the tracker panel share one answer.

- **Order:** highest initiative first. Ties: a player character before a monster,
  then who joined first, then the id ([rulings.md](rulings.md), "Initiative
  ties"). An unrolled combatant sorts last.
- **Who takes turns:** a combatant with an initiative who is not defeated. An
  unrolled one waits in the list until it rolls; a defeated one stays in place for
  the GM but is skipped.
- **Stepping:** `nextCombatant` and `previousCombatant` return who is next and
  whether the step went past the end (or start) of the order, which is when the
  round changes. With nobody active, forward gives the first and counts as the
  start of round 1. An id no longer in the order is treated as nobody, so the
  server steps *before* it removes a combatant.

## Turn boundaries
`startOfTurn(participants, activeCombatantId)` and `endOfTurn(...)`
(`systems/pf2e/src/rules/turnBoundaries.ts`) are pure. They take everyone in the
combat (id, conditions borne, turn state) and return the new values to write for
only the combatants that changed, plus **events** describing each change (expired,
ticked, reduced) so the table is told and the GM can undo it by hand. The server's
`combat.nextTurn` applies them in one transaction (ADR 0018, decision 5).

- **Start of a turn:** the active combatant's actions, attack count, and reaction
  reset; their `rounds` durations tick; any condition on anyone that lasts "until
  the start of" their turn ends; and their **stunned** takes actions off the turn
  (counted as spent) and wears off by that many.
- **End of a turn:** their *frightened* drops by 1; and any condition on anyone
  that lasts "until the end of" their turn ends. Their **persistent damage** is handed back as `persistentDue` for the server to roll and apply, then to resolve the DC 15 flat checks ([conditions.md](conditions.md), "Persistent damage").
- Looks at **every** participant's conditions, because a goblin held "until the end
  of Valeria's turn" bears the condition but is anchored to Valeria.
- Not here: rolling and applying persistent damage, which the server does right after (`persistentDamage.ts`, [conditions.md](conditions.md)). The dying chain is `dyingChain.ts` ([conditions.md](conditions.md), "The dying chain"), applied by the server in B.6. How many actions a
  turn has (3, plus quickened, minus slowed) is `actionCapacity`. When a combatant is removed, conditions anchored to
  it are the server's to clean up (B.1).

## Turn undo
The current turn can be rewound one step at a time (ADR 0019). The server keeps
the stack in two tables beside the documents, `turn_undo_steps` and
`turn_undo_documents`, written in the same transaction as the operation they
shadow (`apps/server/src/turnUndo.ts`):

- **A step opens** when the active combatant's spent actions go up and stay
  within the turn's capacity. Everything after it on that turn, by anyone (a
  move, a reaction, the GM's damage, a condition, the GM's over-budget spend),
  joins that step.
- **Each step records** every document it touched as it was before the step's
  first change to it, or as absent if the step created it. Chat messages are
  never recorded: a roll stays in chat.
- **The stack is cleared** by any operation after which a different turn is
  running (next or previous turn, the end of the combat, its deletion), and it
  is never deeper than the turn's capacity. Nothing is recorded before a turn's
  first spend.

**`combat.undo` (`{combatId}`)** pops the newest step and writes every one of
its documents back: `putDocument` for a recorded before-state, `deleteDocument`
for one the step created (`undoLastStep`, `apps/server/src/turnUndo.ts`).
Refused with `OperationRejected` when there is nothing to undo. The GM may
undo any step; a player only one their own seat opened -- there is no separate
"is it still that combatant's turn" check, since a step can only exist while it
is (the stack is cleared on every turn change, above). A roll's chat message
is never part of what a step restores, so undoing a strike puts the board back
(MAP's attack count included) but leaves the roll exactly as it was; the GM's
own override for a bad roll is editing it directly, not undoing it.

## Permissions
The server derives them and a client never sets them, as for a token
([token.md](token.md)), in `apps/server/src/combat.ts`:

- A **combat** is `none` to players while it is `pending` (the GM is setting it
  up) and `observer` once it has begun or ended.
- A **combatant** is `none` while its combat is pending or its own `hidden` flag
  is set, and `observer` otherwise. The GM always reads everything.

`combat.create`, `combat.addCombatant`, `combat.removeCombatant`, `combat.rollInitiative`,
`combat.setInitiative`, `combat.moveCombatant`, `combat.start`, `combat.end`, `combat.nextTurn`, `combat.previousTurn`, `combat.setMovementRuling` and `combat.spendAction` are the operations so far ([operations.md](operations.md)). Deleting a token or an actor removes the combatants of those tokens, and deleting a scene
removes its combats with all their combatants (`cascadeCombatDeletion`). Conditions anchored to a combatant that goes end with it, and a combat whose active combatant went loses that pointer.

## Starting and ending
`combat.start` is the only thing that begins a combat, and it is the GM's: until
then the combat is `pending`, hidden from players, and nothing constrains
movement. It rolls everyone who has no initiative, flips the combat and its
visible combatants to readable, sets round 1 with the top of the order active, and
runs that combatant's start-of-turn rules ([Turn boundaries](#turn-boundaries)). The
table is told what those rules did in a chat line. `combat.end` clears the turn
pointer and any out-of-turn grants, ends conditions anchored to a combatant's turn,
and leaves the combat as a record. `combat.nextTurn` runs the
end-of-turn rules for the combatant leaving and the start-of-turn rules for the one
arriving in one transaction, and the round counts up when the order wraps.
`combat.previousTurn` only moves the pointer and the round back: it does **not**
undo what the boundary rules changed, because a condition that ended or an action
that was spent cannot be known to be wanted back, so the GM sets those by hand.

## Example
```ts
combatSchema.parse({
  id: '4b1e7c20-9d3a-4f6e-8c11-2a5d7e9f0b34',
  worldId: '0b9a3c52-7e0d-4a47-8a0a-6c1d0f6d2b88',
  type: 'combat',
  schemaVersion: 1,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  permissions: { default: 'observer' },
  sceneId: '2d7a4e0a-8a3f-4f0e-9d1c-5b6a1f9c3e21',
  status: 'active',
  round: 2,
  activeCombatantId: '9e2f6a18-1c4d-4b7a-a3e5-7d0c8b1f2a46',
});
```

## Testing
`packages/core/src/combat.test.ts`: a combat's defaults (pending, round 0,
nobody active) and a running one kept; every status and no other; a round that is
negative, a fraction, or past the bound; a malformed active id and a missing scene.
A combatant's defaults (unrolled, in the fight, visible, a fresh turn); a negative
initiative kept; a partly written turn filled in; overspending allowed; an
initiative that is not a finite number or is past its bound (fractions are kept); a counter that is a fraction, negative, or past its bound; the free-movement ruling and the movement grant; and each of
the three required ids.
