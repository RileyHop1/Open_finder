import { describe, expect, it } from 'vitest';

import { mapPredicateArray } from './mapPredicate.js';

describe('mapPredicateArray', () => {
  it('maps undefined to no predicate at all', () => {
    expect(mapPredicateArray(undefined)).toEqual({ ok: true });
  });

  it('maps an empty array to no predicate at all', () => {
    expect(mapPredicateArray([])).toEqual({ ok: true });
  });

  it('maps a single string element straight through, unwrapped', () => {
    expect(mapPredicateArray(['flanking'])).toEqual({ ok: true, predicate: 'flanking' });
  });

  it('wraps more than one element in all -- the array is an implicit AND', () => {
    expect(mapPredicateArray(['flanking', 'off-guard'])).toEqual({
      ok: true,
      predicate: { all: ['flanking', 'off-guard'] },
    });
  });

  it('maps a nested and/or/not', () => {
    const result = mapPredicateArray([
      { and: ['flanking', { or: ['weapon:trait:agile', { not: 'prone' }] }] },
    ]);
    expect(result).toEqual({
      ok: true,
      predicate: { all: ['flanking', { any: ['weapon:trait:agile', { not: 'prone' }] }] },
    });
  });

  it('fails the whole predicate on an unsupported comparison operator', () => {
    expect(mapPredicateArray([{ gte: ['@actor.level', 5] }]).ok).toBe(false);
  });

  it('fails the whole predicate when only one of several clauses is unsupported', () => {
    // Dropping the unsupported clause and keeping the rest would silently
    // change what the condition means -- the whole predicate must fail.
    expect(mapPredicateArray(['flanking', { gte: ['@actor.level', 5] }]).ok).toBe(false);
  });

  it('fails on an unsupported combinator (xor/nand/nor)', () => {
    expect(mapPredicateArray([{ xor: ['a', 'b'] }]).ok).toBe(false);
  });

  it('rejects a non-array predicate value', () => {
    expect(mapPredicateArray('flanking').ok).toBe(false);
  });
});
