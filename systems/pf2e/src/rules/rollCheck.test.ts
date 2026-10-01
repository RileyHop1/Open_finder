import type { Statistic } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import { describe, expect, it } from 'vitest';

import { rollCheck } from './rollCheck.js';

const fixed =
  (face: number): RandomSource =>
  () =>
    face;

const statistic = (total: number): Statistic => ({ total, modifiers: [] });

describe('rollCheck', () => {
  it('adds the statistic total to a d20 and reports the natural face', () => {
    const { roll, degree } = rollCheck({ statistic: statistic(7), rng: fixed(12) });
    expect(roll.expression).toBe('1d20+7');
    expect(roll.total).toBe(19);
    expect(roll.natural).toBe(12);
    expect(degree).toBeUndefined();
    expect(roll).not.toHaveProperty('degree');
  });

  it('writes a negative bonus as a subtraction', () => {
    const { roll } = rollCheck({ statistic: statistic(-2), rng: fixed(10) });
    expect(roll.expression).toBe('1d20-2');
    expect(roll.total).toBe(8);
  });

  it('resolves the degree against a DC, in all four degrees', () => {
    const at = (bonus: number, face: number) =>
      rollCheck({ statistic: statistic(bonus), dc: 20, rng: fixed(face) }).degree;
    expect(at(15, 15)).toBe('criticalSuccess'); // 30, DC + 10
    expect(at(10, 10)).toBe('success'); // 20, meets the DC
    expect(at(10, 9)).toBe('failure'); // 19
    expect(at(0, 10)).toBe('criticalFailure'); // 10, DC - 10
  });

  it('shifts one degree on a natural 20 and a natural 1', () => {
    const at = (face: number) =>
      rollCheck({ statistic: statistic(0), dc: 15, rng: fixed(face) }).degree;
    expect(at(20)).toBe('criticalSuccess');
    expect(at(1)).toBe('criticalFailure');
  });

  it('stores the degree on the roll too, so it can be saved as a chat roll as-is', () => {
    const { roll, degree } = rollCheck({
      statistic: statistic(5),
      dc: 15,
      rng: fixed(10),
    });
    expect(roll.degree).toBe(degree);
    expect(degree).toBe('success');
  });
});
