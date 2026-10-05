import { describe, expect, it } from 'vitest';

import { ZERO_COINS } from '../content/coins.js';
import { adjustCoins, coinsToCopper, copperToCoins } from './coins.js';

describe('coinsToCopper', () => {
  it('converts each denomination to its copper value', () => {
    expect(coinsToCopper({ pp: 1, gp: 0, sp: 0, cp: 0 })).toBe(1000);
    expect(coinsToCopper({ pp: 0, gp: 1, sp: 0, cp: 0 })).toBe(100);
    expect(coinsToCopper({ pp: 0, gp: 0, sp: 1, cp: 0 })).toBe(10);
    expect(coinsToCopper({ pp: 0, gp: 0, sp: 0, cp: 1 })).toBe(1);
  });

  it('sums a mixed purse', () => {
    expect(coinsToCopper({ pp: 1, gp: 2, sp: 3, cp: 4 })).toBe(1234);
  });

  it('treats a missing field as 0, for a partial delta', () => {
    expect(coinsToCopper({ gp: 5 })).toBe(500);
    expect(coinsToCopper({})).toBe(0);
  });

  it('works with a negative delta the same as a positive purse', () => {
    expect(coinsToCopper({ gp: -5 })).toBe(-500);
  });
});

describe('copperToCoins', () => {
  it('makes change with the fewest coins, largest denomination first', () => {
    expect(copperToCoins(1234)).toEqual({ pp: 1, gp: 2, sp: 3, cp: 4 });
  });

  it('is 0 of everything for 0 copper', () => {
    expect(copperToCoins(0)).toEqual(ZERO_COINS);
  });

  it('round-trips through coinsToCopper', () => {
    const coins = { pp: 3, gp: 7, sp: 9, cp: 2 };
    expect(copperToCoins(coinsToCopper(coins))).toEqual(coins);
  });
});

describe('adjustCoins', () => {
  it('adds a positive delta', () => {
    expect(adjustCoins(ZERO_COINS, 1234)).toEqual({ pp: 1, gp: 2, sp: 3, cp: 4 });
  });

  it('spends, remaking change, when the purse can cover it', () => {
    // 1 gp (100 cp), spend 25 cp -> 75 cp -> 7 sp 5 cp.
    const purse = { ...ZERO_COINS, gp: 1 };
    expect(adjustCoins(purse, -25)).toEqual({ pp: 0, gp: 0, sp: 7, cp: 5 });
  });

  it('breaks a larger denomination to cover an odd spend', () => {
    // 1 gp, spend 5 cp -> 95 cp -> 9 sp 5 cp, even though no silver was held.
    const purse = { ...ZERO_COINS, gp: 1 };
    expect(adjustCoins(purse, -5)).toEqual({ pp: 0, gp: 0, sp: 9, cp: 5 });
  });

  it('refuses a spend the purse cannot cover, rather than going negative', () => {
    expect(adjustCoins(ZERO_COINS, -1)).toBeUndefined();
  });

  it('refuses a spend that would leave a negative total even across denominations', () => {
    const purse = { ...ZERO_COINS, sp: 1 };
    expect(adjustCoins(purse, -11)).toBeUndefined();
  });
});
