import { describe, expect, it } from 'vitest';

import { predicateSchema, testPredicate } from './predicate.js';

describe('predicateSchema', () => {
  it('accepts a bare string', () => {
    expect(predicateSchema.safeParse('self:type:humanoid').success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(predicateSchema.safeParse('').success).toBe(false);
  });

  it('accepts nested all/any/not composition', () => {
    const predicate = {
      all: ['flanking', { any: ['weapon:trait:agile', { not: 'off-guard' }] }],
    };
    expect(predicateSchema.safeParse(predicate).success).toBe(true);
  });

  it('rejects an object with an unsupported key (e.g. a comparison operator)', () => {
    // Upstream's predicate language has gt/gte/lt/lte/eq/xor/nand/nor; v1
    // supports only presence, all, any, and not (see the module doc).
    expect(predicateSchema.safeParse({ gt: ['@actor.level', 5] }).success).toBe(false);
  });

  it('rejects an object mixing two combinators (ambiguous, and unsupported by any real case)', () => {
    expect(predicateSchema.safeParse({ all: ['a'], any: ['b'] }).success).toBe(false);
  });
});

describe('testPredicate -- presence', () => {
  it('is true when the roll option is present', () => {
    expect(testPredicate('flanking', new Set(['flanking']))).toBe(true);
  });

  it('is false when the roll option is absent', () => {
    expect(testPredicate('flanking', new Set())).toBe(false);
  });
});

describe('testPredicate -- all (AND)', () => {
  it('is true when every clause holds', () => {
    const predicate = { all: ['flanking', 'target:off-guard'] };
    expect(testPredicate(predicate, new Set(['flanking', 'target:off-guard']))).toBe(
      true,
    );
  });

  it('is false when any clause fails', () => {
    const predicate = { all: ['flanking', 'target:off-guard'] };
    expect(testPredicate(predicate, new Set(['flanking']))).toBe(false);
  });

  it('an empty all is vacuously true', () => {
    expect(testPredicate({ all: [] }, new Set())).toBe(true);
  });
});

describe('testPredicate -- any (OR)', () => {
  it('is true when at least one clause holds', () => {
    const predicate = { any: ['flanking', 'target:off-guard'] };
    expect(testPredicate(predicate, new Set(['target:off-guard']))).toBe(true);
  });

  it('is false when no clause holds', () => {
    const predicate = { any: ['flanking', 'target:off-guard'] };
    expect(testPredicate(predicate, new Set())).toBe(false);
  });

  it('an empty any is vacuously false', () => {
    expect(testPredicate({ any: [] }, new Set())).toBe(false);
  });
});

describe('testPredicate -- not', () => {
  it('inverts the inner predicate', () => {
    expect(testPredicate({ not: 'flanking' }, new Set())).toBe(true);
    expect(testPredicate({ not: 'flanking' }, new Set(['flanking']))).toBe(false);
  });

  it('double negation cancels out', () => {
    const predicate = { not: { not: 'flanking' } };
    expect(testPredicate(predicate, new Set(['flanking']))).toBe(true);
  });
});

describe('testPredicate -- nested composition', () => {
  it('evaluates a realistic multi-level predicate correctly', () => {
    // "flanking, and (the weapon is agile or the target is off-guard)"
    const predicate = {
      all: ['flanking', { any: ['weapon:trait:agile', 'target:off-guard'] }],
    };
    expect(testPredicate(predicate, new Set(['flanking', 'weapon:trait:agile']))).toBe(
      true,
    );
    expect(testPredicate(predicate, new Set(['flanking']))).toBe(false);
    expect(testPredicate(predicate, new Set(['weapon:trait:agile']))).toBe(false);
  });
});
