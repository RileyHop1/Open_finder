import { describe, expect, it } from 'vitest';

import { applyBoost, applyFlaw, attributeModifier } from './attributes.js';

describe('attributeModifier -- the standard score-to-modifier table', () => {
  it.each([
    [1, -5],
    [2, -4],
    [3, -4],
    [4, -3],
    [5, -3],
    [6, -2],
    [7, -2],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [13, 1],
    [14, 2],
    [15, 2],
    [16, 3],
    [17, 3],
    [18, 4],
    [19, 4],
    [20, 5],
    [21, 5],
    [22, 6],
  ] as const)('score %d has modifier %d', (score, expected) => {
    expect(attributeModifier(score)).toBe(expected);
  });
});

describe('applyBoost -- the partial-boost rule above 18', () => {
  it.each([
    [8, 10],
    [16, 18],
    [17, 19],
  ] as const)('a full +2 boost on %d yields %d', (score, expected) => {
    expect(applyBoost(score)).toBe(expected);
  });

  it.each([
    [18, 19],
    [19, 20],
    [20, 21],
  ] as const)('a partial +1 boost on %d (already 18+) yields %d', (score, expected) => {
    expect(applyBoost(score)).toBe(expected);
  });
});

describe('applyFlaw -- unconditional -2', () => {
  it.each([
    [10, 8],
    [18, 16],
    [8, 6],
  ] as const)('a flaw on %d yields %d', (score, expected) => {
    expect(applyFlaw(score)).toBe(expected);
  });
});
