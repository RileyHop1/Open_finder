# 0019. Turn undo: snapshot the documents, not the operations

- **Status:** Accepted
- **Date:** 2026-10-04
- **Depends on:** ADR 0005 (concurrency), ADR 0018 (combat tracker)
- **Amends:** CLAUDE.md's "Undo/redo in prep mode... not offered in play mode"

## Context
M5's first playtest exercised the one piece of play-mode undo that already
existed — "undo last action" on the action bar — and found it does not hold up.
Today it is a stack kept only in the browser (`stores/combat.ts`'s `turnLog`),
and it only records two kinds of thing: an action-bar spend and a token move.
Everything else that happens during a turn is invisible to it:

- The action tray has its own separate "undo an action" that does not touch the
  stack at all, so the two can get out of sync (undoing a tray spend doesn't
  remove a move entry that logically came after it, and vice versa).
- Damage, healing, and conditions — the dying chain among them — have no undo
  at all. A misclick on `actor.applyDamage` stands until the GM fixes it by hand.
- Nothing another seat does mid-turn is captured. A Reactive Strike that fires
  because of your move, or damage the GM applies while you're still acting, both
  fall outside a client-only log that only knows about its own seat's clicks.

CLAUDE.md's reasoning for keeping undo out of play mode is sound in general:
inverting an operation after other people have acted on it is genuinely hard.
But "undo your own current turn" is a narrower claim than "undo anything,
anytime" — the scope is one turn, one table, happening live, and everyone at
it already expects a GM to say "hang on, let's rewind that" out loud. The
feature already half-exists and is visibly broken rather than visibly absent,
which is worse. This ADR narrows the claim instead of removing the feature:
undo gets a real foundation, scoped tightly enough that the hard case ADR 0005
declines — inverting something a third party has already built on — mostly
doesn't arise, and is refused outright on the rare turn where it would.

## Decision
1. **Undo restores document snapshots, not operation inverses.** Before the
   first write an open step makes to a document, the server records that
   document's full prior body (or its absence, if the step creates it).
   Undoing a step writes those bodies back. This sidesteps writing and
   maintaining a bespoke inverse for every operation type — including the
   dying chain's conditional transitions, which are exactly the kind of logic
   an inverse would have to duplicate and could easily duplicate wrong.
2. **A step is the unit of undo, not an operation.** A step opens when a
   combatant's own in-budget action spend lands (`combat.spendAction`, within
   `actionCapacity`), and stays open until the next one opens. Everything else
   that happens in between — a move, a strike's roll and its MAP counter, a
   Reactive Strike, damage or healing the GM applies, a condition anyone sets —
   joins the *currently open* step, whoever caused it. Undoing a step reverses
   all of it at once, which is the only way "move, and someone reacts to the
   move" can undo cleanly: the reaction's effects are part of the same step the
   move opened.
3. **The stack is capped at the turn's action capacity.** A combatant with 3
   actions this turn can have at most 3 steps open at once; the oldest is
   dropped once a fourth would be recorded. This keeps the snapshot table small
   without needing a separate pruning pass.
4. **An over-budget spend never opens its own step.** `combat.spendAction`
   still only warns past capacity for the GM (`docs/action-economy.md`) and the
   spend still happens — this ADR doesn't touch that rule — but the step it
   joins is the last *in-budget* one, so undoing that step rewinds past the
   overspend along with whatever else was in it, rather than needing a step of
   its own that the cap has no room for.
5. **The stack lives only for the current turn.** It is cleared by any
   operation after which a different turn is running (`combat.nextTurn`,
   `combat.previousTurn`, `combat.end`, deleting the combat), without those
   operations having to know undo exists. It is turn-scoped working state, not
   campaign history. A world export copies the database whole, stack
   included; that is harmless, since an exported stack still belongs to the
   turn the exported combat is on.
6. **Who may undo:** the seat that opened a step may undo it, but only on that
   combatant's own turn (consistent with the existing movement turn-gate). The
   GM may undo any step, at any time — the same "never blocked" escape hatch
   the GM already has everywhere else in combat.
7. **Rolls are never undone.** A roll's chat message is left alone by an undo,
   even when the step that produced it rewinds the board around it (MAP's
   attack count, the HP the strike's damage would have cost, and so on). The
   obvious alternative — delete the card — would let a player quietly reroll a
   bad result by undoing and repeating the strike, with nothing in chat to show
   it happened. Leaving the card is the same trust CLAUDE.md already places in
   a GM to moderate a table in person; the other half of that trust is a
   GM-only "edit this roll" override, so a genuinely bad roll still has a fix
   that isn't "pretend it didn't happen."

## Consequences
- **Undo becomes one mechanism instead of two.** The action bar's stack and the
  tray's separate undo both go away in favor of one "undo last action" that
  always reverses the true last step, server-confirmed, for every kind of
  change a turn can make.
- **A new small, append-only table.** `turn_undo` stores the snapshot rows: one
  per (combat, combatant, step, document) the first time that step touches it.
  It is written in the same transaction as the operation it is shadowing, so it
  can never drift from what was actually applied, and it is deleted in bulk at
  the turn-clearing points in point 5.
- **Undo is a real operation (`combat.undo`), not a client-side replay.** It
  goes through the same validate → apply → sequence → broadcast pipeline as
  everything else in ADR 0005, so every connected client sees the exact
  documents that came back, not a locally-reconstructed guess.
- **The hard case ADR 0005 worried about is narrowed, not solved.** If a third
  party acts on a document *after* the step that's being undone but *before*
  the undo arrives, undoing still overwrites their change (last-write-wins,
  consistent with ADR 0005 point 5) — undo is not exempt from that rule, it
  just rarely collides with it in practice, because the window is one turn at
  one table and the GM can always see what's about to be reversed before
  confirming the undo out loud.
- **Keyboard movement needs its own adjustment** (tracked separately): if
  every arrow-key press became its own Stride under RAW movement cost, walking
  three squares would be three steps and three actions. The movement PR in this
  same stack makes arrow keys plan a path and commit it as one move on Enter,
  so a keyboard move is one step like a drag is.

## Alternatives considered
### Keep the client-only stack, just merge the tray and bar's two stacks into one
Cheaper, and fixes the "two stacks disagree" symptom. Rejected: it does nothing
for damage, conditions, or anything a third party does mid-turn, which is most
of what playtesting actually flagged. It also still relies on the browser
remembering state nothing server-side can verify, so a reload loses the stack
with no way to tell the player why "undo" just disappeared.

### Inverse operations (a hand-written "undo" for each operation type)
The more conventional approach, and arguably clearer to read per-operation.
Rejected because the dying chain, persistent damage, and condition merging are
all stateful, conditional transitions (ADR 0018, `docs/conditions.md`) —
writing a correct inverse for each means re-deriving the same branching logic
in reverse, twice the surface area to get right, and a silent behavior change
in the forward direction (a rules fix) would desync its inverse without CI
necessarily catching it. A document snapshot is correct by construction: it
doesn't need to understand what changed, only what things looked like before.

### Full event-sourced replay from the operation log (building on ADR 0005 point 7)
Already the documented long-term direction for prep-mode undo. Rejected for
*this* case specifically: play-mode undo needs to be live and bounded to the
current turn, and replaying from a sequence point forward would have to
re-run every operation since, including ones belonging to other combatants'
turns in between if the GM takes any action — a snapshot table scoped to the
open turn is far simpler and exactly the shape this problem actually has.
