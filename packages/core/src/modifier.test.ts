import { describe, expect, it } from 'vitest';

import {
  MODIFIER_TYPES,
  modifierSchema,
  resolvedModifierSchema,
  statisticSchema,
} from './modifier.js';

function makeModifier(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: 'heroism',
    label: 'Heroism',
    type: 'status',
    value: 2,
    source: 'Heroism (spell)',
    enabled: true,
    ...overrides,
  };
}

describe('modifierSchema', () => {
  it('accepts a well-formed unconditional modifier', () => {
    expect(modifierSchema.safeParse(makeModifier()).success).toBe(true);
  });

  it('accepts a modifier with a predicate', () => {
    const result = modifierSchema.safeParse(
      makeModifier({ predicate: { all: ['flanking'] } }),
    );
    expect(result.success).toBe(true);
  });

  it.each(MODIFIER_TYPES)('accepts the %s modifier type', (type) => {
    expect(modifierSchema.safeParse(makeModifier({ type })).success).toBe(true);
  });

  it('rejects a modifier type outside the stacking vocabulary', () => {
    expect(modifierSchema.safeParse(makeModifier({ type: 'morale' })).success).toBe(
      false,
    );
  });

  it('rejects a missing source -- every modifier must be attributable', () => {
    const { source: _source, ...rest } = makeModifier();
    expect(modifierSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-integer value', () => {
    expect(modifierSchema.safeParse(makeModifier({ value: 1.5 })).success).toBe(false);
  });
});

describe('resolvedModifierSchema', () => {
  it('accepts an applied modifier with no suppressedBy', () => {
    const result = resolvedModifierSchema.safeParse({
      ...makeModifier(),
      applied: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a suppressed modifier that names what suppressed it', () => {
    const result = resolvedModifierSchema.safeParse({
      ...makeModifier(),
      applied: false,
      suppressedBy: 'bless',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a suppressed modifier with no suppressedBy (disabled or predicate-failed)', () => {
    const result = resolvedModifierSchema.safeParse({
      ...makeModifier(),
      applied: false,
    });
    expect(result.success).toBe(true);
  });
});

describe('statisticSchema', () => {
  it('accepts a total with its full modifier list', () => {
    const result = statisticSchema.safeParse({
      total: 12,
      modifiers: [
        { ...makeModifier(), applied: true },
        {
          ...makeModifier({ slug: 'bless', value: 1 }),
          applied: false,
          suppressedBy: 'heroism',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty modifier list', () => {
    expect(statisticSchema.safeParse({ total: 0, modifiers: [] }).success).toBe(true);
  });
});
