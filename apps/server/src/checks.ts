/**
 * Rolling a check from a character sheet. The server resolves the statistic
 * itself (`prepareCharacter`) and rolls the die (`rollCheck`), so the number a
 * player sees is never one a client supplied; the chat message it stores keeps
 * the whole resolved statistic beside the roll (`chatCheckMessageSchema`).
 *
 * Only the statistics that are "a bonus added to a d20" are rollable here:
 * Perception, the three saves, and skills. AC and the class DC are numbers
 * others roll against, and strikes have their own operations (they need a
 * Multiple Attack Penalty step and a damage roll).
 */

import type { Actor, ChatCheckMessage, Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import { characterDataSchema, prepareCharacter, rollCheck } from '@hearthtable/pf2e';

import { OperationRejected } from './rejection.js';
import { loadOwnedDocument } from './writeGuard.js';
import type { WorldStore } from './worldStore.js';

const ROLLABLE = new Set(['perception', 'fortitude', 'reflex', 'will']);

/** `perception` -> `Perception`; `skill:lore-wine` -> `Lore Wine`. */
function labelFor(statistic: string): string {
  const name = statistic.startsWith('skill:')
    ? statistic.slice('skill:'.length)
    : statistic;
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Rolls `payload.statistic` for character `payload.actorId` on behalf of
 * `seat` (who must own it) and stores the result as a `check` chat message,
 * visible to the whole table. An unknown or unrollable statistic, or an actor
 * with no character sheet, is rejected before anything is rolled or stored.
 */
export function rollActorCheck(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  payload: { actorId: string; statistic: string; dc?: number | undefined },
): ChatCheckMessage {
  const { raw } = loadOwnedDocument(store, seat, payload.actorId, 'actor', 'actor');
  const actor: Actor = actorSchema.parse(raw);
  if (actor.kind !== 'character') {
    throw new OperationRejected(`a ${actor.kind} does not have a character sheet`);
  }

  const isRollable =
    ROLLABLE.has(payload.statistic) || payload.statistic.startsWith('skill:');
  const statistic = isRollable
    ? prepareCharacter(characterDataSchema.parse(actor.system)).statistics[
        payload.statistic
      ]
    : undefined;
  if (statistic === undefined) {
    throw new OperationRejected(`${payload.statistic} cannot be rolled as a check`);
  }

  const { roll } = rollCheck({
    statistic,
    rng,
    ...(payload.dc === undefined ? {} : { dc: payload.dc }),
  });

  const now = new Date().toISOString();
  const message: ChatCheckMessage = {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: now,
    updatedAt: now,
    seatId: seat.id,
    kind: 'check',
    actorId: actor.id,
    actorName: actor.name,
    statistic: payload.statistic,
    label: labelFor(payload.statistic),
    ...(payload.dc === undefined ? {} : { dc: payload.dc }),
    breakdown: statistic,
    roll,
  };
  store.putDocument(message);
  return message;
}
