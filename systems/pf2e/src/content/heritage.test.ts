import { describe, expect, it } from 'vitest';

import { heritageEntrySchema } from './heritage.js';

function makeHeritage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'heritages',
    slug: 'rock-dwarf',
    name: 'Rock Dwarf',
    kind: 'heritage',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    ancestrySlug: 'dwarf',
    ...overrides,
  };
}

describe('heritageEntrySchema', () => {
  it('accepts a heritage tied to a specific ancestry', () => {
    expect(heritageEntrySchema.safeParse(makeHeritage()).success).toBe(true);
  });

  it('accepts a versatile heritage with no ancestrySlug', () => {
    const { ancestrySlug: _ancestrySlug, ...rest } = makeHeritage({
      slug: 'changeling',
      name: 'Changeling',
    });
    const result = heritageEntrySchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ancestrySlug).toBeUndefined();
    }
  });

  it('rejects an empty ancestrySlug', () => {
    expect(
      heritageEntrySchema.safeParse(makeHeritage({ ancestrySlug: '' })).success,
    ).toBe(false);
  });
});
