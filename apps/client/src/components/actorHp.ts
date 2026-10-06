/**
 * An actor's hit points as a percentage of their maximum, for the party bar and
 * the HP bar under a token. One place, so the two can never disagree about how
 * full a bar is. Only a character or a monster the seat can read reaches this;
 * a player's view of a monster they cannot read comes from the token's own
 * `hpBar` instead (docs/token.md).
 */

import type { Actor } from '@hearthtable/core';
import {
  characterDataSchema,
  npcDataSchema,
  prepareCharacter,
  prepareNpc,
} from '@hearthtable/pf2e';

/** `current` as a whole percentage of `max`, within 0 to 100. A maximum of 0 or less reads as empty. */
export function hpPercent(current: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((current / max) * 100)));
}

/** Whether `actor` is a character or a monster, and its current and maximum hit points; `undefined` for anything without hit points data. */
export function actorHp(
  actor: Actor,
): { kind: 'character' | 'npc'; current: number; max: number } | undefined {
  if (actor.kind === 'character') {
    const data = characterDataSchema.safeParse(actor.system);
    if (data.success) {
      const hp = prepareCharacter(data.data).hp;
      return { kind: 'character', current: hp.current, max: hp.max.total };
    }
  }
  if (actor.kind === 'npc') {
    const data = npcDataSchema.safeParse(actor.system);
    if (data.success) {
      const hp = prepareNpc(data.data).hp;
      return { kind: 'npc', current: hp.current, max: hp.max.total };
    }
  }
  return undefined;
}
