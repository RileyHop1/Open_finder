import { describe, expect, it } from 'vitest';

import type { Coins } from '../content/coins.js';
import { ZERO_COINS } from '../content/coins.js';
import { coinBulk, encumbranceStatus, itemsBulk, totalBulk } from './bulk.js';

function item(bulk: number | undefined, quantity = 1) {
  return { entry: bulk === undefined ? {} : { bulk }, quantity };
}

describe('coinBulk', () => {
  it('is 1 at exactly 1,000 coins, regardless of denomination', () => {
    expect(coinBulk({ ...ZERO_COINS, gp: 1000 })).toBe(1);
    expect(coinBulk({ pp: 250, gp: 250, sp: 250, cp: 250 })).toBe(1);
  });

  it('is fractional below 1,000 coins', () => {
    expect(coinBulk({ ...ZERO_COINS, gp: 500 })).toBe(0.5);
  });

  it('is 0 for an empty purse', () => {
    expect(coinBulk(ZERO_COINS)).toBe(0);
  });
});

describe('itemsBulk', () => {
  it('sums bulk times quantity across items', () => {
    expect(itemsBulk([item(1, 1), item(0.1, 3)])).toBeCloseTo(1.3);
  });

  it('treats a missing bulk as 0, not as an error', () => {
    expect(itemsBulk([item(undefined, 5)])).toBe(0);
  });

  it('is 0 for no items', () => {
    expect(itemsBulk([])).toBe(0);
  });
});

describe('totalBulk', () => {
  it('is items plus coins', () => {
    const coins: Coins = { ...ZERO_COINS, gp: 500 };
    expect(totalBulk([item(1), item(2)], coins)).toBeCloseTo(3.5);
  });
});

describe('encumbranceStatus', () => {
  it('sets encumberedAt to 5 + Str and maxBulk to 10 + Str', () => {
    const status = encumbranceStatus(0, 2);
    expect(status.encumberedAt).toBe(7);
    expect(status.maxBulk).toBe(12);
  });

  it('is not encumbered at or below the threshold', () => {
    expect(encumbranceStatus(5, 0).isEncumbered).toBe(false);
  });

  it('is encumbered just above the threshold', () => {
    expect(encumbranceStatus(5.1, 0).isEncumbered).toBe(true);
  });

  it('exceedsMax follows the same above-not-at-or-below rule', () => {
    expect(encumbranceStatus(10, 0).exceedsMax).toBe(false);
    expect(encumbranceStatus(10.1, 0).exceedsMax).toBe(true);
  });

  it('shifts both thresholds down for a negative Strength modifier', () => {
    const status = encumbranceStatus(3, -1);
    expect(status.encumberedAt).toBe(4);
    expect(status.isEncumbered).toBe(false);
  });
});
