/**
 * A purse of coins -- a character's and the party stash's shape alike
 * (ADR 0021, `docs/inventory.md`). Four non-negative integer denominations,
 * never a single running copper total: the *display* always wants separate
 * denominations, and `rules/coins.ts` (a later PR) is where that total gets
 * computed when spending needs it, not here.
 */

import { z } from 'zod';

export const coinsSchema = z.object({
  pp: z.number().int().nonnegative().default(0),
  gp: z.number().int().nonnegative().default(0),
  sp: z.number().int().nonnegative().default(0),
  cp: z.number().int().nonnegative().default(0),
});

export type Coins = z.infer<typeof coinsSchema>;

/** An empty purse -- what a new character or the party stash starts with. */
export const ZERO_COINS: Coins = { pp: 0, gp: 0, sp: 0, cp: 0 };
