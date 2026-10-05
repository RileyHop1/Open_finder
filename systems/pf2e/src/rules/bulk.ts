/**
 * Bulk and encumbrance (ADR 0021, `docs/inventory.md`, and the "Encumbrance
 * thresholds" entry in `docs/rulings.md`). Total Bulk is **computed**, the
 * same way every other statistic is (ADR 0008) -- never stored, so an item,
 * a quantity, or a Strength change is reflected the next time this runs,
 * with nothing to invalidate.
 *
 * **Applying the `encumbered` condition automatically is not this module's
 * job.** This only computes whether a character *is* encumbered; writing
 * that condition onto the character happens in the operation layer, once an
 * item or coin change actually occurs (a later PR) -- this module has no
 * side effects at all.
 */

import type { Coins } from '../content/coins.js';

/**
 * Anything `totalBulk` can sum: a character's own items, or the party
 * stash's. Structural, not `CharacterItem` or `StashItem` specifically, so
 * this needs neither import. `entry` is typed loosely on purpose: of the
 * entry kinds an item can carry (weapon/armor/gear have `bulk`; feat/
 * classFeature/spell/action never do), TypeScript treats a union that
 * mixed has no single structural type a plain `{ bulk?: number }` could
 * describe, so `itemsBulk` below reads it defensively instead.
 */
export interface BulkCarrier {
  readonly entry: object;
  readonly quantity: number;
}

/**
 * Coins count toward Bulk by raw coin count, not value: 1,000 coins of any
 * mix of denominations is 1 Bulk (`docs/inventory.md`), not 1,000 gp worth
 * of coins. A fractional result (999 coins = 0.999 Bulk) is correct and
 * expected -- `encumbranceStatus` compares the running total, not a
 * rounded one.
 */
export function coinBulk(coins: Coins): number {
  return (coins.pp + coins.gp + coins.sp + coins.cp) / 1000;
}

/** Sums `bulk * quantity` across every carried item. An item with no `bulk` (not yet imported with one, genuinely negligible, or an entry kind that never carries one) counts as 0, per `bulkSchema`'s own doc comment. */
export function itemsBulk(items: readonly BulkCarrier[]): number {
  return items.reduce((total, item) => {
    const bulk = (item.entry as Record<string, unknown>).bulk;
    return total + (typeof bulk === 'number' ? bulk : 0) * item.quantity;
  }, 0);
}

export function totalBulk(items: readonly BulkCarrier[], coins: Coins): number {
  return itemsBulk(items) + coinBulk(coins);
}

export interface EncumbranceStatus {
  readonly totalBulk: number;
  /** Encumbered above this Bulk: `5 + Strength modifier`. */
  readonly encumberedAt: number;
  /** Cannot carry more than this Bulk: `10 + Strength modifier` **(confirm against GM Core: whether exceeding this is a hard block or a GM call)**. */
  readonly maxBulk: number;
  readonly isEncumbered: boolean;
  readonly exceedsMax: boolean;
}

export function encumbranceStatus(
  totalBulkValue: number,
  strengthModifier: number,
): EncumbranceStatus {
  const encumberedAt = 5 + strengthModifier;
  const maxBulk = 10 + strengthModifier;
  return {
    totalBulk: totalBulkValue,
    encumberedAt,
    maxBulk,
    isEncumbered: totalBulkValue > encumberedAt,
    exceedsMax: totalBulkValue > maxBulk,
  };
}
