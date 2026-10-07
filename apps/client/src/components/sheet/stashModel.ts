/**
 * The party stash's coin math for the UI (ADR 0021, `docs/inventory.md`):
 * splitting the purse evenly. Pure, so it is unit-tested apart from the panel.
 */

import { type Coins, coinsToCopper, copperToCoins } from '@hearthtable/pf2e';

/**
 * Each of `shares` members' equal portion of `coins`, as the fewest coins, or
 * `undefined` when there is nobody to share with or a portion would be nothing.
 * Worked out in copper, so a lone gold piece splits into silver and copper for
 * three people; whatever does not divide evenly (the remainder) simply stays in
 * the stash.
 */
export function evenShare(coins: Coins, shares: number): Coins | undefined {
  if (!Number.isInteger(shares) || shares < 1) {
    return undefined;
  }
  const each = Math.floor(coinsToCopper(coins) / shares);
  return each > 0 ? copperToCoins(each) : undefined;
}
