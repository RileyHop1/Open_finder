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
 * - **stunned** takes actions off the front of the turn (up to what the turn has,
 *   after slowed) and wears off by that many; the lost actions count as spent;
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
 * automated change. At the end of a turn the persistent damage that is due comes
 * back in `persistentDue`, to be rolled by the server (`persistentDamage.ts`); the
 * dying chain is `dyingChain.ts`, and how many actions a turn has is `actionCapacity`.
 */

import type { TurnState } from '@hearthtable/core';

import type { AppliedCondition } from '../content/character.js';
import type { PersistentDamage } from '../content/persistentDamage.js';
import { actionCapacity } from './actionCapacity.js';
import { persistentDamageDue } from './persistentDamage.js';

/** One combatant, as the turn rules see it: its id, the conditions it bears, and what it has used. */
export interface TurnParticipant {
  readonly combatantId: string;
  readonly conditions: readonly AppliedCondition[];
  readonly turn: TurnState;
  /** Persistent damage it bears; absent means none. Only read at the end of its own turn. */
  readonly persistentDamage?: readonly PersistentDamage[];
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
  /** Stunned took this many of the turn's actions; they count as spent. */
  | {
      readonly kind: 'actionsLost';
      readonly combatantId: string;
      readonly slug: string;
      readonly count: number;
    }
  /** A valued condition went down (frightened at the end of a turn, stunned as it takes actions). `to` is 0 when it ended. */
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
  /**
   * Persistent damage that is due now (the end of its bearer's turn): the server
   * rolls it, applies it, and resolves the flat checks (`persistentDamage.ts`).
   * Empty at the start of a turn, and for a bearer with none.
   */
  readonly persistentDue: { combatantId: string; entries: PersistentDamage[] }[];
}

const FRESH_TURN: TurnState = {
  actionsSpent: 0,
  reactionUsed: false,
  attacksMade: 0,
  movementUsed: 0,
};

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
    a.attacksMade === b.attacksMade &&
    a.movementUsed === b.movementUsed
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
    let conditions: AppliedCondition[] = [];
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

    let turn = own ? FRESH_TURN : participant.turn;

    // Stunned takes actions off the front of the turn, then wears off by that many.
    const stunned = own
      ? conditions.find((c) => c.slug === 'stunned' && c.value !== undefined)
      : undefined;
    if (stunned?.value !== undefined) {
      const lost = Math.min(stunned.value, actionCapacity(conditions).total);
      if (lost > 0) {
        const to = stunned.value - lost;
        turn = { ...FRESH_TURN, actionsSpent: lost };
        conditions = conditions.flatMap((c) =>
          c !== stunned ? [c] : to > 0 ? [{ ...c, value: to }] : [],
        );
        events.push(
          {
            kind: 'actionsLost',
            combatantId: participant.combatantId,
            slug: 'stunned',
            count: lost,
          },
          {
            kind: 'reduced',
            combatantId: participant.combatantId,
            slug: 'stunned',
            from: stunned.value,
            to,
          },
        );
        touched = true;
      }
    }

    if (touched || !sameTurn(turn, participant.turn)) {
      changes.push({
        combatantId: participant.combatantId,
        conditions,
        turn: { ...turn },
      });
    }
  }

  return { changes, events, persistentDue: [] };
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

  const active = participants.find((p) => p.combatantId === activeCombatantId);
  const due = persistentDamageDue(active?.persistentDamage ?? []);
  return {
    changes,
    events,
    persistentDue:
      due.length === 0 ? [] : [{ combatantId: activeCombatantId, entries: due }],
  };
}
