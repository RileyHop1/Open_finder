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

import type { Actor, ChatCheckMessage, Seat, Statistic } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import {
  characterDataSchema,
  npcDataSchema,
  prepareCharacter,
  prepareNpc,
  rollCheck,
} from '@hearthtable/pf2e';

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

/** The actor's prepared statistics: a character from its sheet, a monster from its creature. Anything else is rejected. */
export function preparedStatistics(actor: Actor): Readonly<Record<string, Statistic>> {
  if (actor.kind === 'character') {
    return prepareCharacter(characterDataSchema.parse(actor.system)).statistics;
  }
  if (actor.kind === 'npc') {
    const data = npcDataSchema.safeParse(actor.system);
    if (!data.success) {
      throw new OperationRejected(`${actor.name} has no creature stats to roll`);
    }
    return prepareNpc(data.data).statistics;
  }
  throw new OperationRejected(`a ${actor.kind} does not have a character sheet`);
}

/**
 * Rolls `payload.statistic` for character or monster `payload.actorId` on behalf of
 * `seat` (who must own it) and stores the result as a `check` chat message,
 * visible to the whole table. An unknown or unrollable statistic, or an actor
 * with no character sheet, is rejected before anything is rolled or stored.
 * `options.gmOnly` keeps the message from players (a hidden combatant's initiative).
 */
export function rollActorCheck(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  payload: { actorId: string; statistic: string; dc?: number | undefined },
  options: { gmOnly?: boolean } = {},
): ChatCheckMessage {
  const { raw } = loadOwnedDocument(store, seat, payload.actorId, 'actor', 'actor');
  const actor: Actor = actorSchema.parse(raw);
  const isRollable =
    ROLLABLE.has(payload.statistic) || payload.statistic.startsWith('skill:');
  const statistic = isRollable ? preparedStatistics(actor)[payload.statistic] : undefined;
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
    permissions: { default: options.gmOnly === true ? 'none' : 'observer', seats: {} },
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
