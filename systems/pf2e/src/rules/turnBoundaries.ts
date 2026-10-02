/**
 * What changes when a turn starts and when it ends -- the pure rules behind the
 * combat tracker's turn operation (ADR 0018, decision 5). Given everyone in the
 * combat and whose turn it is, each function says exactly what to write back and
 * why, and the server applies it in one transaction. Nothing here touches a
 * store, a clock, or a random number.
 *
 * **Start of a turn** (the combatant whose turn begins):
 * - their actions, attack count, and reaction are fresh: the reaction refreshes
 *   and the Multiple Attack Penalty resets (`docs/rulings.md`);
 * - a `rounds` duration on their conditions ticks down one, ending at zero;
 * - any condition anywhere that lasts "until the start of their turn" ends.
 *
 * **End of a turn:**
 * - their *frightened* drops by one (and ends at zero);
 * - any condition anywhere that lasts "until the end of their turn" ends.
 *
 * Conditions that last until a combatant's turn live on whoever bears them: a
 * goblin held "until the end of Valeria's turn" is on the goblin, so both
 * functions look at **every** participant's conditions, not only the active
 * one's. Calendar durations (`minutes`, `hours`, `days`) are never touched here:
 * nothing ticks them until the Calendar exists (milestone 13).
 *
 * Every change comes back as an event too, so the table is told what happened
 * (a chat card) and the GM can undo it by hand, as CLAUDE.md requires of every
 * automated change. Persistent damage and the dying chain are separate rules
 * (A.7, A.8) and slowed, stunned and quickened's actions are A.6's.
 */

import type { TurnState } from '@hearthtable/core';

import type { AppliedCondition } from '../content/character.js';

/** One combatant, as the turn rules see it: its id, the conditions it bears, and what it has used. */
export interface TurnParticipant {
  readonly combatantId: string;
  readonly conditions: readonly AppliedCondition[];
  readonly turn: TurnState;
}

/** The new values for one combatant, written back only when something changed. */
export interface TurnChange {
  readonly combatantId: string;
  readonly conditions: AppliedCondition[];
  readonly turn: TurnState;
}

/** What happened to a condition, for the chat card and the GM's undo. */
export type TurnEvent =
  /** The condition ended because its duration did. */
  | { readonly kind: 'expired'; readonly combatantId: string; readonly slug: string }
  /** A `rounds` duration counted down and has this many left. */
  | {
      readonly kind: 'ticked';
      readonly combatantId: string;
      readonly slug: string;
      readonly remaining: number;
    }
  /** A valued condition went down by one at the end of a turn. `to` is 0 when it ended. */
  | {
      readonly kind: 'reduced';
      readonly combatantId: string;
      readonly slug: string;
      readonly from: number;
      readonly to: number;
    };

export interface TurnResult {
  /** Only the participants that changed, in the order they were given. */
  readonly changes: TurnChange[];
  readonly events: TurnEvent[];
}

const FRESH_TURN: TurnState = { actionsSpent: 0, reactionUsed: false, attacksMade: 0 };

/** Whether `condition` lasts until the `boundary` of `combatantId`'s turn. */
function endsAt(
  condition: AppliedCondition,
  combatantId: string,
  boundary: 'start' | 'end',
): boolean {
  const duration = condition.duration;
  return (
    duration?.type === 'turn' &&
    duration.combatantId === combatantId &&
    duration.boundary === boundary
  );
}

function sameTurn(a: TurnState, b: TurnState): boolean {
  return (
    a.actionsSpent === b.actionsSpent &&
    a.reactionUsed === b.reactionUsed &&
    a.attacksMade === b.attacksMade
  );
}

/** What starts a turn: see the file comment. */
export function startOfTurn(
  participants: readonly TurnParticipant[],
  activeCombatantId: string,
): TurnResult {
  const changes: TurnChange[] = [];
  const events: TurnEvent[] = [];

  for (const participant of participants) {
    const own = participant.combatantId === activeCombatantId;
    const conditions: AppliedCondition[] = [];
    let touched = false;

    for (const condition of participant.conditions) {
      if (endsAt(condition, activeCombatantId, 'start')) {
        events.push({
          kind: 'expired',
          combatantId: participant.combatantId,
          slug: condition.slug,
        });
        touched = true;
        continue;
      }
      if (own && condition.duration?.type === 'rounds') {
        const remaining = condition.duration.remaining - 1;
        touched = true;
        if (remaining <= 0) {
          events.push({
            kind: 'expired',
            combatantId: participant.combatantId,
            slug: condition.slug,
          });
          continue;
        }
        events.push({
          kind: 'ticked',
          combatantId: participant.combatantId,
          slug: condition.slug,
          remaining,
        });
        conditions.push({ ...condition, duration: { type: 'rounds', remaining } });
        continue;
      }
      conditions.push(condition);
    }

    const turn = own ? FRESH_TURN : participant.turn;
    if (touched || !sameTurn(turn, participant.turn)) {
      changes.push({
        combatantId: participant.combatantId,
        conditions,
        turn: { ...turn },
      });
    }
  }

  return { changes, events };
}

/** What ends a turn: see the file comment. */
export function endOfTurn(
  participants: readonly TurnParticipant[],
  activeCombatantId: string,
): TurnResult {
  const changes: TurnChange[] = [];
  const events: TurnEvent[] = [];

  for (const participant of participants) {
    const own = participant.combatantId === activeCombatantId;
    const conditions: AppliedCondition[] = [];
    let touched = false;

    for (const condition of participant.conditions) {
      if (endsAt(condition, activeCombatantId, 'end')) {
        events.push({
          kind: 'expired',
          combatantId: participant.combatantId,
          slug: condition.slug,
        });
        touched = true;
        continue;
      }
      if (own && condition.slug === 'frightened' && condition.value !== undefined) {
        const to = condition.value - 1;
        events.push({
          kind: 'reduced',
          combatantId: participant.combatantId,
          slug: condition.slug,
          from: condition.value,
          to,
        });
        touched = true;
        if (to > 0) {
          conditions.push({ ...condition, value: to });
        }
        continue;
      }
      conditions.push(condition);
    }

    if (touched) {
      changes.push({
        combatantId: participant.combatantId,
        conditions,
        turn: { ...participant.turn },
      });
    }
  }

  return { changes, events };
}
