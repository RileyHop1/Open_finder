import { describe, expect, it } from 'vitest';

import { degreeOfSuccess } from './degreesOfSuccess.js';

const DC = 15;

describe('degreeOfSuccess -- the base table (natural face has no effect)', () => {
  it.each([
    [DC - 10, 'criticalFailure'],
    [DC - 1, 'failure'],
    [DC, 'success'],
    [DC + 9, 'success'],
    [DC + 10, 'criticalSuccess'],
  ] as const)('total %d against DC %d is %s', (total, expected) => {
    // 10 is an ordinary face: not 20, not 1, so it never shifts the result.
    expect(degreeOfSuccess(total, DC, 10)).toBe(expected);
  });
});

describe('degreeOfSuccess -- the full boundary x natural-face matrix', () => {
  // The five totals from the base table above, each crossed with a natural 1
  // (shift down), a natural 20 (shift up), and an ordinary face (no shift).
  // This is the "Tests" list from docs/dice.md, worked out by hand.
  it.each([
    // [total, natural, expected]
    [DC - 10, 10, 'criticalFailure'],
    [DC - 10, 1, 'criticalFailure'], // already at the bottom; clamps
    [DC - 10, 20, 'failure'],

    [DC - 1, 10, 'failure'],
    [DC - 1, 1, 'criticalFailure'],
    [DC - 1, 20, 'success'],

    [DC, 10, 'success'],
    [DC, 1, 'failure'],
    [DC, 20, 'criticalSuccess'],

    [DC + 9, 10, 'success'],
    [DC + 9, 1, 'failure'],
    [DC + 9, 20, 'criticalSuccess'],

    [DC + 10, 10, 'criticalSuccess'],
    [DC + 10, 1, 'success'],
    [DC + 10, 20, 'criticalSuccess'], // already at the top; clamps
  ] as const)('total %d, natural %d -> %s', (total, natural, expected) => {
    expect(degreeOfSuccess(total, DC, natural)).toBe(expected);
  });
});

describe('degreeOfSuccess -- the two cases docs/dice.md calls out by name', () => {
  it('a natural 20 that still falls short of the DC is a success, not a critical success', () => {
    // Total is DC - 1: short of the DC even with the natural 20's own face
    // value counted in (the total already includes it). The shift still
    // only moves the result one step, not straight to critical success.
    expect(degreeOfSuccess(DC - 1, DC, 20)).toBe('success');
  });

  it('a natural 1 on a total that beat DC+10 is a success, not a critical failure', () => {
    expect(degreeOfSuccess(DC + 10, DC, 1)).toBe('success');
  });
});

describe('degreeOfSuccess -- order of operations', () => {
  it('compares the total to the DC before applying any shift, not after', () => {
    // If the shift were applied first (e.g. by nudging the DC comparison
    // itself), a natural 1 well above DC+10 could still land on failure or
    // worse. Pin the correct one-step-only result explicitly.
    expect(degreeOfSuccess(DC + 25, DC, 1)).toBe('success');
    expect(degreeOfSuccess(DC - 25, DC, 20)).toBe('failure');
  });
});
