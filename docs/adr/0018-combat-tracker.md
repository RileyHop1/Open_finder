# 0018. Combat tracker: server-owned turn state, combatants as documents, expiry inside the turn operation

- **Status:** Accepted
- **Date:** 2026-10-02
- **Relates to:** ADR 0005 (concurrency), ADR 0007 (seats, trusted network),
  ADR 0008 (modifier resolution), ADR 0014 (actor shape), ADR 0017 (scenes and
  tokens)

## Context
Milestone 5 adds the first rules that depend on *time*: initiative, whose turn it
is, three actions and a reaction per turn, the Multiple Attack Penalty, conditions
that end at a particular moment, and the dying chain. Several forces pull on the
shape:

- **Combat is shared, live state with a lot of writers.** The GM advances turns,
  a player spends actions, a monster's condition expires, and a flat check ends
  persistent damage, sometimes within the same second. This is exactly the case
  ADR 0005 exists for.
- **Players must not learn what the GM has hidden.** A hidden monster must not
  appear in the initiative order, and ADR 0017 already ruled out putting
  per-viewer-redacted items inside an array in one document.
- **Time-based rules are where VTT automation goes wrong.** A condition that
  ends a turn late, or a MAP that carries over a round, is noticed at once and
  trusted by nobody afterwards (see "wrong number the player trusts" in
  CLAUDE.md). The rules for *when* things tick need to be pure functions with
  golden tests, not logic spread across handlers.
- **The GM is the director** (CLAUDE.md). Every automated change here needs a
  visible, manual override, and `docs/action-economy.md` has already settled that
  actions are warned about and never blocked.
- **Conditions already exist** (`docs/conditions.md`, milestone 3) as
  `{ slug, value? }` on an actor, with no notion of duration.

## Decision
1. **A `Combat` is a document** (`type: 'combat'`) for one encounter: the scene it
   is on, the `round`, the `activeCombatantId`, and whether it has `started` or
   `ended`. Nothing about *rules* lives in it, only where the encounter is in
   time. Only one combat per world may be started at a time.
2. **A combatant is its own document** (`type: 'combatant'`), with `combatId`,
   `tokenId`, `actorId`, `initiative`, `defeated`, and its **per-turn state**:
   actions spent, whether the reaction is used, and the number of attacks made.
   This follows ADR 0017's reasoning for tokens: a hidden combatant's permissions
   are derived by the server and the existing read filter applies, so a hidden
   monster never reaches a player's browser, and a spent action is one small write.
3. **The order is computed, never stored.** The initiative order is initiative
   descending, with the tie rule from `docs/rulings.md`, derived from the
   combatants. Adding a combatant or changing an initiative changes no other
   document, and there is no index to keep consistent. The active turn is a
   combatant *id*, not a position.
4. **Turn state belongs to the combatant, not the actor.** The same actor can be in
   no combat or, over time, many. Per-turn counters reset at the start of that
   combatant's turn, and ending a combat leaves the actor exactly as it was, apart
   from the real changes (hit points, conditions).
5. **A turn boundary is one operation, and it does everything.** `combat.nextTurn`
   (and its siblings) runs pure functions from `systems/pf2e`, `endOfTurn` for the
   combatant leaving and `startOfTurn` for the one arriving, and applies their
   result in the same transaction: expired conditions removed, frightened lowered,
   persistent damage and its flat check rolled, the reaction refreshed, the attack
   count reset, the pointer moved. It broadcasts as one change (ADR 0005, decision
   2). **Expiry is a server operation, not a client timer.**
6. **Conditions gain a `duration`**: until the start or end of a named
   combatant's turn, a number of rounds, sustained, or until removed. A condition
   written before this milestone has none and means until removed. Minute and
   hour durations belong to the `Calendar` (milestone 13) and are not built here.
7. **The tracker supplies the Multiple Attack Penalty.** While a combatant's turn
   is active, a strike's attack number comes from its attack count and is shown on
   the roll's breakdown. A client may still send an explicit number: that is the
   GM and player override, and it is how a reaction attack or a ruling is handled.
8. **What is automated, what is prompted, what is only shown.**
   - *Automated*: turn boundaries, MAP counting, duration expiry, frightened
     reducing, the dying transitions, persistent damage rolls, and flanking
     (which names its source on the off-guard it applies).
   - *Prompted, never decided*: reactions, which are surfaced to the owning seat
     and never spent for them; and the targets of an area template, which the GM
     confirms.
   - *Shown, never blocked*: action costs and overspending, as the action economy
     page already decides.
   Every automated change posts a chat card or sits visibly on the sheet, and has
   a manual path (`setCondition`, set initiative, set actions spent, set HP).
9. **Players are shown the table's order, not the GM's secrets.** A hidden
   combatant is absent from a player's order. If it is the active one, the player
   sees that it is "someone's turn" and nothing else, since the pointer's target
   is a document they cannot read.

## Consequences
- **Many small documents again.** A fight of a dozen creatures is a combat plus a
  dozen combatants, each a row and a broadcast. That is what keeps spending one
  action to a single small write, and the client store indexes them by combat.
- **A turn change touches many documents in one transaction** (the combatants
  leaving and arriving, any conditions that expired, hit points if persistent
  damage landed). It is the largest write in the app, so it needs the most
  tests, including that a player never receives a hidden creature's change.
- **The pure rules functions carry the risk.** The behavior that matters (when a
  duration ends, how dying moves) is in `systems/pf2e` where golden tests can
  reach it without a server, in line with ADR 0013. Handlers stay thin.
- **A migration is part of the first rules PR.** The condition shape gains a
  field, and `schemaVersion` plus its migration fixture are required (CLAUDE.md,
  Data durability), even though no existing world holds a duration.
- **The player's order has a deliberate hole** where a hidden creature acts.
  That matches a table where the GM does not announce an ambush, and it costs the
  players an exact picture of the round. Accepted.
- **Only one combat runs at a time.** A party split across two fights is not
  supported, matching ADR 0017's single party and single current scene.
- **Nothing here works without a token.** A combatant is a token on a scene, so
  a hazard or a creature with no token cannot join a fight. The GM places one
  first, which is the same rule the rest of the map already follows.

## Alternatives considered
### The client runs the tracker
Each browser tracks the round and whose turn it is, and the server just stores
rolls. Rejected: it makes every client a source of truth for exactly the state
where disagreement ends a session ("whose turn is it?"), and ADR 0005 already
rejects clients resolving conflicts. It also leaves expiry to a client timer,
which this ADR rules out.

### Combatants embedded in the combat document
One document holding the whole order. Fewer rows, one fetch. Rejected: a hidden
combatant would need per-viewer redaction inside a document, which ADR 0017
shows `visibility.ts` cannot do, and two players spending actions on the same turn
would write to one document instead of two.

### Turn state stored on the actor
Put actions spent and attack count on the actor, as the sheet's other counters.
Rejected: the state is meaningless outside a fight, would have to be cleared on
every exit path from a combat, and would turn each action spent into an actor
write that rebroadcasts the whole sheet.

### A stored turn order with an index
Keep an ordered list and an integer turn index, as many trackers do. Rejected:
adding a late arrival or fixing an initiative would mean renumbering a list other
clients also edit, and a pointer by position silently moves to the wrong creature
when the list changes. The order is cheap to derive, so it is derived.

### Expire conditions on a client timer or when someone looks
Lazily drop an expired condition when a sheet is next opened. Rejected: different
clients would show different conditions until each looked, and a roll made in
between would use a modifier that should already be gone.
