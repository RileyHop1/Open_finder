import { describe, expect, it } from 'vitest';

import type { Modifier } from './modifier.js';
import { resolveStatistic } from './resolveStatistic.js';

function mod(
  overrides: Partial<Modifier> & Pick<Modifier, 'slug' | 'type' | 'value'>,
): Modifier {
  return {
    label: overrides.slug,
    source: 'test fixture',
    enabled: true,
    ...overrides,
  };
}

describe('resolveStatistic -- untyped and always-stacking types', () => {
  it('sums every untyped modifier -- untyped never suppresses', () => {
    const result = resolveStatistic([
      mod({ slug: 'a', type: 'untyped', value: 1 }),
      mod({ slug: 'b', type: 'untyped', value: 2 }),
      mod({ slug: 'c', type: 'untyped', value: 3 }),
    ]);
    expect(result.total).toBe(6);
    expect(result.modifiers.every((m) => m.applied)).toBe(true);
  });

  it('proficiency and ability always stack, even multiple of each', () => {
    const result = resolveStatistic([
      mod({ slug: 'trained', type: 'proficiency', value: 2 }),
      mod({ slug: 'dex-mod', type: 'ability', value: 3 }),
    ]);
    expect(result.total).toBe(5);
    expect(result.modifiers.every((m) => m.applied)).toBe(true);
  });
});

describe('resolveStatistic -- typed bonuses (highest of each type applies)', () => {
  it('applies only the highest circumstance bonus; the rest are suppressed', () => {
    const result = resolveStatistic([
      mod({ slug: 'flanking', type: 'circumstance', value: 2 }),
      mod({ slug: 'cover', type: 'circumstance', value: 4 }),
    ]);
    const total = result.modifiers.find((m) => m.slug === 'flanking')!;
    const cover = result.modifiers.find((m) => m.slug === 'cover')!;
    expect(cover.applied).toBe(true);
    expect(total.applied).toBe(false);
    expect(total.suppressedBy).toBe('cover');
    expect(result.total).toBe(4);
  });

  it('the ADR 0008 example: a +3 status bonus beats a +2 status bonus', () => {
    const result = resolveStatistic([
      mod({ slug: 'heroism', label: 'Heroism', type: 'status', value: 2 }),
      mod({ slug: 'bless', label: 'Bless', type: 'status', value: 3 }),
    ]);
    const heroism = result.modifiers.find((m) => m.slug === 'heroism')!;
    const bless = result.modifiers.find((m) => m.slug === 'bless')!;
    expect(bless.applied).toBe(true);
    expect(heroism.applied).toBe(false);
    expect(heroism.suppressedBy).toBe('bless');
    expect(result.total).toBe(3);
  });
});

describe('resolveStatistic -- typed penalties (worst of each type applies)', () => {
  it('applies only the most negative item penalty; the rest are suppressed', () => {
    const result = resolveStatistic([
      mod({ slug: 'sickened-1', type: 'item', value: -1 }),
      mod({ slug: 'sickened-2', type: 'item', value: -2 }),
    ]);
    const worse = result.modifiers.find((m) => m.slug === 'sickened-2')!;
    const milder = result.modifiers.find((m) => m.slug === 'sickened-1')!;
    expect(worse.applied).toBe(true);
    expect(milder.applied).toBe(false);
    expect(milder.suppressedBy).toBe('sickened-2');
    expect(result.total).toBe(-2);
  });
});

describe('resolveStatistic -- independence between groups', () => {
  it('a bonus and a penalty of the same type both apply -- separate groups', () => {
    const result = resolveStatistic([
      mod({ slug: 'bonus', type: 'circumstance', value: 2 }),
      mod({ slug: 'penalty', type: 'circumstance', value: -2 }),
    ]);
    expect(result.modifiers.every((m) => m.applied)).toBe(true);
    expect(result.total).toBe(0);
  });

  it('different types never suppress each other', () => {
    const result = resolveStatistic([
      mod({ slug: 'circumstance-bonus', type: 'circumstance', value: 1 }),
      mod({ slug: 'status-bonus', type: 'status', value: 1 }),
      mod({ slug: 'item-bonus', type: 'item', value: 1 }),
    ]);
    expect(result.modifiers.every((m) => m.applied)).toBe(true);
    expect(result.total).toBe(3);
  });
});

describe('resolveStatistic -- disabled and predicate-gated modifiers', () => {
  it('a disabled modifier does not apply, has no suppressedBy, and does not block a weaker rival', () => {
    const result = resolveStatistic([
      mod({ slug: 'big', type: 'circumstance', value: 4, enabled: false }),
      mod({ slug: 'small', type: 'circumstance', value: 1 }),
    ]);
    const big = result.modifiers.find((m) => m.slug === 'big')!;
    const small = result.modifiers.find((m) => m.slug === 'small')!;
    expect(big.applied).toBe(false);
    expect(big.suppressedBy).toBeUndefined();
    expect(small.applied).toBe(true);
    expect(result.total).toBe(1);
  });

  it('a modifier whose predicate fails does not apply', () => {
    const result = resolveStatistic(
      [
        mod({
          slug: 'flanking-bonus',
          type: 'circumstance',
          value: 2,
          predicate: 'flanking',
        }),
      ],
      { rollOptions: new Set() },
    );
    expect(result.modifiers[0]!.applied).toBe(false);
    expect(result.total).toBe(0);
  });

  it('a modifier whose predicate passes applies and can win its group', () => {
    const result = resolveStatistic(
      [
        mod({
          slug: 'flanking-bonus',
          type: 'circumstance',
          value: 2,
          predicate: 'flanking',
        }),
      ],
      { rollOptions: new Set(['flanking']) },
    );
    expect(result.modifiers[0]!.applied).toBe(true);
    expect(result.total).toBe(2);
  });
});

describe('resolveStatistic -- deterministic tie-break', () => {
  it('breaks a value tie by slug, alphabetically first, regardless of input order', () => {
    const forward = resolveStatistic([
      mod({ slug: 'alpha', type: 'circumstance', value: 2 }),
      mod({ slug: 'beta', type: 'circumstance', value: 2 }),
    ]);
    const reversed = resolveStatistic([
      mod({ slug: 'beta', type: 'circumstance', value: 2 }),
      mod({ slug: 'alpha', type: 'circumstance', value: 2 }),
    ]);
    for (const result of [forward, reversed]) {
      const alpha = result.modifiers.find((m) => m.slug === 'alpha')!;
      const beta = result.modifiers.find((m) => m.slug === 'beta')!;
      expect(alpha.applied).toBe(true);
      expect(beta.applied).toBe(false);
      expect(beta.suppressedBy).toBe('alpha');
    }
  });
});

describe('resolveStatistic -- empty input', () => {
  it('resolves to a zero total with an empty modifier list', () => {
    const result = resolveStatistic([]);
    expect(result).toEqual({ total: 0, modifiers: [] });
  });
});
