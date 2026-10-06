import { describe, expect, it } from 'vitest';

import { evenShare } from './stashModel.js';

const coins = (c: Partial<Record<'pp' | 'gp' | 'sp' | 'cp', number>>) => ({
  pp: 0,
  gp: 0,
  sp: 0,
  cp: 0,
  ...c,
});

describe('evenShare', () => {
  it('divides in copper and makes change: one gold among three is 3 sp 3 cp each', () => {
    expect(evenShare(coins({ gp: 1 }), 3)).toEqual(coins({ sp: 3, cp: 3 }));
  });

  it('gives everyone the same whole number of coins, the remainder staying behind', () => {
    // 7 gp 5 sp = 750 cp; four people get 187 cp each (1 gp 8 sp 7 cp), 2 cp left over.
    expect(evenShare(coins({ gp: 7, sp: 5 }), 4)).toEqual(coins({ gp: 1, sp: 8, cp: 7 }));
  });

  it('has nothing to give with nobody to share with, or a portion of less than a copper', () => {
    expect(evenShare(coins({ gp: 5 }), 0)).toBeUndefined();
    expect(evenShare(coins({ cp: 2 }), 3)).toBeUndefined();
    expect(evenShare(coins({}), 2)).toBeUndefined();
  });
});
