import { describe, expect, it } from 'vitest';

import type { DamageComponent } from './damage.js';
import { evaluateDamage } from './damage.js';
import { neverRoll, sequenceRandomSource } from './testHelpers.js';

describe('evaluateDamage -- a normal component', () => {
  it('rolls once and does not double on a non-critical hit', () => {
    const components: DamageComponent[] = [
      { expression: '2d6+4', damageType: 'slashing' },
    ];
    const outcome = evaluateDamage(components, false, {
      rng: sequenceRandomSource([3, 5]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(12); // 3 + 5 + 4
      expect(outcome.result.damage).toEqual({ slashing: 12 });
    }
  });

  it('doubles the whole component -- dice and flat modifiers alike -- on a critical hit', () => {
    const components: DamageComponent[] = [
      { expression: '2d6+4', damageType: 'slashing' },
    ];
    const outcome = evaluateDamage(components, true, {
      rng: sequenceRandomSource([3, 5]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(24); // (3 + 5 + 4) * 2
      expect(outcome.result.damage).toEqual({ slashing: 24 });
    }
  });

  it('doubles every individual term, preserving total === sum(terms.value)', () => {
    const components: DamageComponent[] = [
      { expression: '2d6+4', damageType: 'slashing' },
    ];
    const outcome = evaluateDamage(components, true, {
      rng: sequenceRandomSource([3, 5]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 6, result: 3, kept: true, value: 6 },
        { kind: 'die', faces: 6, result: 5, kept: true, value: 10 },
        { kind: 'constant', value: 8 },
      ]);
      const sum = outcome.result.terms.reduce((total, term) => total + term.value, 0);
      expect(sum).toBe(outcome.result.total);
    }
  });
});

describe('evaluateDamage -- criticalOnly components (PF2e "deadly")', () => {
  it('is skipped entirely on a non-critical hit', () => {
    const components: DamageComponent[] = [
      { expression: '1d6+4', damageType: 'piercing' },
      { expression: '1d8', damageType: 'piercing', doubling: 'criticalOnly' },
    ];
    const outcome = evaluateDamage(components, false, {
      rng: sequenceRandomSource([3]), // only the normal component's die is ever rolled
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(7); // 3 + 4, the deadly die never rolls
      expect(outcome.result.damage).toEqual({ piercing: 7 });
    }
  });

  it('is rolled but never doubled on a critical hit, alongside a doubled normal component', () => {
    const components: DamageComponent[] = [
      { expression: '1d6+4', damageType: 'piercing' },
      { expression: '1d8', damageType: 'piercing', doubling: 'criticalOnly' },
    ];
    // 3 for the base d6, 7 for the deadly d8.
    const outcome = evaluateDamage(components, true, {
      rng: sequenceRandomSource([3, 7]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // (3 + 4) * 2 = 14 from the normal component, + 7 undoubled from deadly.
      expect(outcome.result.total).toBe(21);
      expect(outcome.result.damage).toEqual({ piercing: 21 });
    }
  });

  it("a deadly die count is the caller's concern, not this module's -- it just rolls what it's given", () => {
    // A weapon with a greater striking rune supplies 2 deadly dice; this
    // module has no idea that's what "greater striking" means, it just
    // rolls the "2d8" expression it was handed for the criticalOnly slot.
    const components: DamageComponent[] = [
      { expression: '1d6+4', damageType: 'piercing' },
      { expression: '2d8', damageType: 'piercing', doubling: 'criticalOnly' },
    ];
    const outcome = evaluateDamage(components, true, {
      rng: sequenceRandomSource([3, 5, 6]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // (3 + 4) * 2 = 14, + (5 + 6) = 11 undoubled = 25.
      expect(outcome.result.total).toBe(25);
    }
  });
});

describe('evaluateDamage -- neverDoubled components (PF2e splash)', () => {
  it('is rolled and added, un-doubled, even on a critical hit', () => {
    const components: DamageComponent[] = [
      { expression: '1d6+4', damageType: 'piercing' },
      { expression: '2', damageType: 'splash', doubling: 'neverDoubled' },
    ];
    const outcome = evaluateDamage(components, true, {
      rng: sequenceRandomSource([3]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // (3 + 4) * 2 = 14 piercing, + 2 splash (never doubled).
      expect(outcome.result.total).toBe(16);
      expect(outcome.result.damage).toEqual({ piercing: 14, splash: 2 });
    }
  });

  it('is rolled on a non-critical hit too, just like any other component', () => {
    const components: DamageComponent[] = [
      { expression: '2', damageType: 'splash', doubling: 'neverDoubled' },
    ];
    const outcome = evaluateDamage(components, false, { rng: neverRoll });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.damage).toEqual({ splash: 2 });
    }
  });
});

describe('evaluateDamage -- fatal needs no special support', () => {
  it('a different base expression for the critical case doubles normally, with no dedicated feature', () => {
    // PF2e's "fatal d8" on a 1d6 weapon: on a crit, the caller assembles a
    // different expression (die size upgraded, one extra die added) rather
    // than this module knowing anything about "fatal". Ordinary doubling
    // does the rest.
    const nonCritical: DamageComponent[] = [
      { expression: '1d6+4', damageType: 'piercing' },
    ];
    const critical: DamageComponent[] = [{ expression: '2d8+4', damageType: 'piercing' }];

    const nonCritOutcome = evaluateDamage(nonCritical, false, {
      rng: sequenceRandomSource([5]),
    });
    const critOutcome = evaluateDamage(critical, true, {
      rng: sequenceRandomSource([6, 8]),
    });

    expect(nonCritOutcome.ok).toBe(true);
    expect(critOutcome.ok).toBe(true);
    if (nonCritOutcome.ok && critOutcome.ok) {
      expect(nonCritOutcome.result.total).toBe(9); // 5 + 4
      expect(critOutcome.result.total).toBe(36); // (6 + 8 + 4) * 2
    }
  });
});

describe('evaluateDamage -- precision damage is an ordinary normal component', () => {
  it('doubles on a crit exactly like any other normal component, no special casing needed', () => {
    const components: DamageComponent[] = [
      { expression: '1d6+4', damageType: 'piercing' },
      { expression: '1d6', damageType: 'piercing' }, // precision damage, still "normal"
    ];
    const outcome = evaluateDamage(components, true, {
      rng: sequenceRandomSource([3, 2]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // ((3 + 4) + 2) * 2, doubled together since both feed the same type.
      expect(outcome.result.total).toBe(18);
    }
  });
});

describe('evaluateDamage -- bucketing by damage type', () => {
  it('sums multiple components of the same type and keeps different types separate', () => {
    const components: DamageComponent[] = [
      { expression: '1d6+4', damageType: 'piercing' },
      { expression: '1d4', damageType: 'fire' },
    ];
    const outcome = evaluateDamage(components, false, {
      rng: sequenceRandomSource([3, 2]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.damage).toEqual({ piercing: 7, fire: 2 });
    }
  });
});

describe('evaluateDamage -- the floor at 0', () => {
  it('clamps a type whose raw total goes negative, without touching total/terms', () => {
    const components: DamageComponent[] = [
      { expression: '1d4-6', damageType: 'piercing' },
    ];
    const outcome = evaluateDamage(components, false, {
      rng: sequenceRandomSource([2]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // The raw math is honestly -4; only the `damage` bucket floors at 0.
      expect(outcome.result.total).toBe(-4);
      expect(outcome.result.damage).toEqual({ piercing: 0 });
    }
  });
});

describe('evaluateDamage -- errors', () => {
  it('returns invalid-expression for a malformed component, never throws', () => {
    const components: DamageComponent[] = [{ expression: '1d', damageType: 'piercing' }];
    expect(() => evaluateDamage(components, false, { rng: neverRoll })).not.toThrow();
    const outcome = evaluateDamage(components, false, { rng: neverRoll });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('invalid-expression');
    }
  });

  it('returns unknown-reference when a component needs a reference with no resolver', () => {
    const components: DamageComponent[] = [
      { expression: '1d6+@strength', damageType: 'piercing' },
    ];
    const outcome = evaluateDamage(components, false, {
      rng: sequenceRandomSource([4]),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('unknown-reference');
    }
  });
});

describe('evaluateDamage -- seed', () => {
  it('echoes an explicit seed and omits the key when none is given', () => {
    const components: DamageComponent[] = [{ expression: '1d6', damageType: 'piercing' }];

    const withSeed = evaluateDamage(components, false, {
      rng: sequenceRandomSource([3]),
      seed: 'golden-damage-1',
    });
    expect(withSeed.ok).toBe(true);
    if (withSeed.ok) {
      expect(withSeed.result.seed).toBe('golden-damage-1');
    }

    const withoutSeed = evaluateDamage(components, false, {
      rng: sequenceRandomSource([3]),
    });
    expect(withoutSeed.ok).toBe(true);
    if (withoutSeed.ok) {
      expect(Object.hasOwn(withoutSeed.result, 'seed')).toBe(false);
    }
  });
});
