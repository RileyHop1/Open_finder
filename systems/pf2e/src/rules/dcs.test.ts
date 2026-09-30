import { describe, expect, it } from 'vitest';

import { adjustDc, levelDc, simpleDc } from './dcs.js';

describe('levelDc', () => {
  it.each([
    [-1, 13],
    [0, 14],
    [1, 15],
    [2, 16],
    [3, 18],
    [4, 19],
    [5, 20],
    [6, 22],
    [7, 23],
    [8, 24],
    [9, 26],
    [10, 27],
    [11, 28],
    [12, 30],
    [13, 31],
    [14, 32],
    [15, 34],
    [16, 35],
    [17, 36],
    [18, 38],
    [19, 39],
    [20, 40],
  ] as const)('level %s is DC %s', (level, dc) => {
    expect(levelDc(level)).toBe(dc);
  });

  it('throws for a level below the published range', () => {
    expect(() => levelDc(-2)).toThrow(RangeError);
  });

  it('throws for a level above the published range', () => {
    expect(() => levelDc(21)).toThrow(RangeError);
  });
});

describe('simpleDc', () => {
  it.each([
    ['untrained', 10],
    ['trained', 15],
    ['expert', 20],
    ['master', 30],
    ['legendary', 40],
  ] as const)('%s is DC %s', (rank, dc) => {
    expect(simpleDc(rank)).toBe(dc);
  });
});

describe('adjustDc', () => {
  it.each([
    ['incrediblyEasy', -10],
    ['veryEasy', -5],
    ['easy', -2],
    ['normal', 0],
    ['hard', 2],
    ['veryHard', 5],
    ['incrediblyHard', 10],
  ] as const)('%s adjusts a DC of 20 to %s', (adjustment, expected) => {
    expect(adjustDc(20, adjustment)).toBe(20 + expected);
  });

  it('composes with levelDc and simpleDc', () => {
    expect(adjustDc(levelDc(5), 'hard')).toBe(22);
    expect(adjustDc(simpleDc('trained'), 'veryEasy')).toBe(10);
  });
});
