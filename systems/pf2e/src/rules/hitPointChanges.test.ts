import { describe, expect, it } from 'vitest';

import { applyDamage, applyHealing, grantTemporaryHitPoints } from './hitPointChanges.js';

describe('applyDamage', () => {
  it('comes out of current hit points when there are no temporary ones', () => {
    expect(applyDamage({ current: 20, temp: 0 }, 7)).toEqual({ current: 13, temp: 0 });
  });

  it('comes out of temporary hit points first', () => {
    expect(applyDamage({ current: 20, temp: 5 }, 3)).toEqual({ current: 20, temp: 2 });
  });

  it('spills over from temporary to current hit points', () => {
    expect(applyDamage({ current: 20, temp: 5 }, 8)).toEqual({ current: 17, temp: 0 });
  });

  it('stops at 0 and never goes negative', () => {
    expect(applyDamage({ current: 4, temp: 0 }, 99)).toEqual({ current: 0, temp: 0 });
    expect(applyDamage({ current: 4, temp: 2 }, 99)).toEqual({ current: 0, temp: 0 });
  });

  it('ignores zero, negative, fractional, and non-numeric amounts rather than healing', () => {
    const state = { current: 10, temp: 3 };
    expect(applyDamage(state, 0)).toEqual(state);
    expect(applyDamage(state, -5)).toEqual(state);
    expect(applyDamage(state, Number.NaN)).toEqual(state);
    expect(applyDamage(state, 2.9)).toEqual({ current: 10, temp: 1 });
  });
});

describe('applyHealing', () => {
  it('raises current hit points', () => {
    expect(applyHealing({ current: 5, temp: 2 }, 6, 20)).toEqual({
      current: 11,
      temp: 2,
    });
  });

  it('stops at the maximum', () => {
    expect(applyHealing({ current: 18, temp: 0 }, 10, 20)).toEqual({
      current: 20,
      temp: 0,
    });
  });

  it('does not lower hit points that are already above the maximum', () => {
    expect(applyHealing({ current: 25, temp: 0 }, 5, 20)).toEqual({
      current: 25,
      temp: 0,
    });
  });

  it('ignores a negative amount rather than damaging', () => {
    expect(applyHealing({ current: 5, temp: 0 }, -3, 20)).toEqual({
      current: 5,
      temp: 0,
    });
  });
});

describe('grantTemporaryHitPoints', () => {
  it('gives temporary hit points to someone with none', () => {
    expect(grantTemporaryHitPoints({ current: 10, temp: 0 }, 6)).toEqual({
      current: 10,
      temp: 6,
    });
  });

  it('keeps the larger amount rather than adding the two', () => {
    expect(grantTemporaryHitPoints({ current: 10, temp: 8 }, 5).temp).toBe(8);
    expect(grantTemporaryHitPoints({ current: 10, temp: 5 }, 8).temp).toBe(8);
  });

  it('never changes current hit points', () => {
    expect(grantTemporaryHitPoints({ current: 3, temp: 0 }, 9).current).toBe(3);
  });
});
