import { describe, expect, it } from 'vitest';

import { ZERO_COINS, coinsSchema } from './coins.js';

describe('coinsSchema', () => {
  it('defaults every denomination to 0', () => {
    const result = coinsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 });
    }
  });

  it('accepts an explicit mixed purse', () => {
    const result = coinsSchema.safeParse({ pp: 1, gp: 2, sp: 3, cp: 4 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ pp: 1, gp: 2, sp: 3, cp: 4 });
    }
  });

  it('rejects a negative or non-integer denomination', () => {
    expect(coinsSchema.safeParse({ gp: -1 }).success).toBe(false);
    expect(coinsSchema.safeParse({ gp: 1.5 }).success).toBe(false);
  });
});

describe('ZERO_COINS', () => {
  it('is an empty purse', () => {
    expect(ZERO_COINS).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 });
  });

  it('parses as itself', () => {
    expect(coinsSchema.parse(ZERO_COINS)).toEqual(ZERO_COINS);
  });
});
