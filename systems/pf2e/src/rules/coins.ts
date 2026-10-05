/**
 * Coin arithmetic (ADR 0021, `docs/inventory.md`, and the "Spending coins
 * always makes change" ruling). Pure throughout -- no side effects, no
 * actor, so `editCharacter`/the server's own handlers are what actually
 * write a result back.
 */

import type { Coins } from '../content/coins.js';

const COPPER_PER_DENOMINATION = { pp: 1000, gp: 100, sp: 10, cp: 1 } as const;

/**
 * Any purse- or delta-shaped value `coinsToCopper` can read. Not
 * `Partial<Coins>`: under `exactOptionalPropertyTypes`, that type's
 * optional fields exclude `undefined` from the value itself, while the
 * server's `CoinsDelta` (`@hearthtable/core`, inferred from a Zod
 * `.optional()`) explicitly includes it -- this accepts either.
 */
export interface PartialCoins {
  readonly pp?: number | undefined;
  readonly gp?: number | undefined;
  readonly sp?: number | undefined;
  readonly cp?: number | undefined;
}

/** A purse's value as one copper integer. Works the same whether every field is non-negative (a real purse) or mixed-sign (a delta). */
export function coinsToCopper(coins: PartialCoins): number {
  return (
    (coins.pp ?? 0) * COPPER_PER_DENOMINATION.pp +
    (coins.gp ?? 0) * COPPER_PER_DENOMINATION.gp +
    (coins.sp ?? 0) * COPPER_PER_DENOMINATION.sp +
    (coins.cp ?? 0) * COPPER_PER_DENOMINATION.cp
  );
}

/**
 * The fewest coins totalling `copper`, largest denomination first
 * (`docs/inventory.md`'s "making change"). `copper` must be non-negative;
 * callers that might go negative (`adjustCoins`) check that first.
 */
export function copperToCoins(copper: number): Coins {
  let remaining = copper;
  const pp = Math.floor(remaining / COPPER_PER_DENOMINATION.pp);
  remaining -= pp * COPPER_PER_DENOMINATION.pp;
  const gp = Math.floor(remaining / COPPER_PER_DENOMINATION.gp);
  remaining -= gp * COPPER_PER_DENOMINATION.gp;
  const sp = Math.floor(remaining / COPPER_PER_DENOMINATION.sp);
  remaining -= sp * COPPER_PER_DENOMINATION.sp;
  return { pp, gp, sp, cp: remaining };
}

/**
 * Applies a signed copper delta (positive to receive, negative to spend) to
 * `current`, returning the result reassembled as the fewest coins.
 * `undefined` means the purse cannot cover it -- the caller rejects the
 * whole operation rather than applying a partial deduction.
 */
export function adjustCoins(current: Coins, deltaCopper: number): Coins | undefined {
  const total = coinsToCopper(current) + deltaCopper;
  return total < 0 ? undefined : copperToCoins(total);
}
