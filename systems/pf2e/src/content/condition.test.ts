import { describe, expect, it } from 'vitest';

import { conditionEntrySchema } from './condition.js';

function makeCondition(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'conditions',
    slug: 'frightened',
    name: 'Frightened',
    kind: 'condition',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    valued: true,
    ...overrides,
  };
}

describe('conditionEntrySchema', () => {
  it('accepts a valued condition with no fixed max (e.g. frightened)', () => {
    const result = conditionEntrySchema.safeParse(makeCondition());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxValue).toBeUndefined();
      expect(result.data.group).toBeUndefined();
      expect(result.data.overrides).toEqual([]);
    }
  });

  it('accepts a valued condition with a fixed max (e.g. dying, capped at 4)', () => {
    const result = conditionEntrySchema.safeParse(
      makeCondition({ slug: 'dying', name: 'Dying', maxValue: 4 }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a binary condition (off-guard, the Remaster name -- see docs/conditions.md)', () => {
    const result = conditionEntrySchema.safeParse(
      makeCondition({ slug: 'off-guard', name: 'Off-Guard', valued: false }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects maxValue on a binary condition', () => {
    const result = conditionEntrySchema.safeParse(
      makeCondition({ slug: 'off-guard', name: 'Off-Guard', valued: false, maxValue: 4 }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts a condition that belongs to a mutually exclusive group and overrides others in it', () => {
    const result = conditionEntrySchema.safeParse(
      makeCondition({
        slug: 'undetected',
        name: 'Undetected',
        valued: false,
        group: 'detection',
        overrides: ['hidden', 'observed'],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a mismatched kind', () => {
    expect(conditionEntrySchema.safeParse(makeCondition({ kind: 'feat' })).success).toBe(
      false,
    );
  });
});
