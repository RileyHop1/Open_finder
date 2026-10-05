/**
 * `actor.adjustCoins` (ADR 0021): adjusting a character's purse. Built on
 * `editCharacter` the same way `hitPoints.ts`'s damage and healing are --
 * load, run the pure change, write back together, so a character is never
 * left mid-update.
 */

import type { Actor, CoinsDelta, Seat } from '@hearthtable/core';
import { adjustCoins, coinsToCopper } from '@hearthtable/pf2e';

import { editCharacter } from './actors.js';
import { OperationRejected } from './rejection.js';
import type { WorldStore } from './worldStore.js';

export interface CoinsChange {
  readonly documents: readonly [Actor];
}

/**
 * Adjusts actor `actorId`'s purse by `delta`. Owner or GM. Refused outright,
 * with nothing written, if the delta would take any total below zero.
 */
export function adjustActorCoins(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string; delta: CoinsDelta },
): CoinsChange {
  const updated = editCharacter(store, seat, payload.actorId, (data) => {
    const next = adjustCoins(data.coins, coinsToCopper(payload.delta));
    if (next === undefined) {
      throw new OperationRejected('this character does not have enough coins for that');
    }
    return { ...data, coins: next };
  });
  return { documents: [updated] };
}
