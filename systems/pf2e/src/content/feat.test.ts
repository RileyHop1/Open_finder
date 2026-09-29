import { describe, expect, it } from 'vitest';

import { FEAT_CATEGORIES, featEntrySchema } from './feat.js';

function makeFeat(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'feats',
    slug: 'toughness',
    name: 'Toughness',
    kind: 'feat',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    level: 1,
    category: 'general',
    ...overrides,
  };
}

describe('featEntrySchema', () => {
  it('accepts a minimal well-formed feat, defaulting prerequisites and traits', () => {
    const result = featEntrySchema.safeParse(makeFeat());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prerequisites).toEqual([]);
      expect(result.data.traits).toEqual([]);
      expect(result.data.actionCost).toBeUndefined();
    }
  });

  it.each(FEAT_CATEGORIES)('accepts the %s category', (category) => {
    expect(featEntrySchema.safeParse(makeFeat({ category })).success).toBe(true);
  });

  it('accepts a feat with an action cost, traits, and prerequisites', () => {
    const result = featEntrySchema.safeParse(
      makeFeat({
        category: 'skill',
        actionCost: 'one',
        traits: ['general', 'skill'],
        prerequisites: ['trained in Athletics'],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a category outside the closed vocabulary', () => {
    expect(featEntrySchema.safeParse(makeFeat({ category: 'racial' })).success).toBe(
      false,
    );
  });

  it('rejects level 0 -- feats start at level 1', () => {
    expect(featEntrySchema.safeParse(makeFeat({ level: 0 })).success).toBe(false);
  });

  it('rejects a trait that is not a valid slug', () => {
    expect(featEntrySchema.safeParse(makeFeat({ traits: ['Not A Slug'] })).success).toBe(
      false,
    );
  });

  it('rejects a mismatched kind', () => {
    expect(featEntrySchema.safeParse(makeFeat({ kind: 'action' })).success).toBe(false);
  });
});
