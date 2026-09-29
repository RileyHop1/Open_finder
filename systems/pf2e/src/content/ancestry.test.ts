import { describe, expect, it } from 'vitest';

import { ancestryEntrySchema } from './ancestry.js';

function makeAncestry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'ancestries',
    slug: 'human',
    name: 'Human',
    kind: 'ancestry',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    hp: 8,
    size: 'medium',
    speed: 25,
    ...overrides,
  };
}

describe('ancestryEntrySchema', () => {
  it('accepts a minimal well-formed ancestry, defaulting boosts/flaws/languages', () => {
    const result = ancestryEntrySchema.safeParse(makeAncestry());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.boosts).toEqual([]);
      expect(result.data.freeBoosts).toBe(0);
      expect(result.data.flaws).toEqual([]);
      expect(result.data.languages).toEqual([]);
    }
  });

  it('accepts a human-shaped ancestry: no fixed boosts, two free boosts', () => {
    const result = ancestryEntrySchema.safeParse(makeAncestry({ freeBoosts: 2 }));
    expect(result.success).toBe(true);
  });

  it('accepts an elf-shaped ancestry: fixed boosts plus one free boost', () => {
    const result = ancestryEntrySchema.safeParse(
      makeAncestry({
        slug: 'elf',
        name: 'Elf',
        speed: 30,
        boosts: ['dex', 'int'],
        freeBoosts: 1,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts languages', () => {
    const result = ancestryEntrySchema.safeParse(
      makeAncestry({ languages: ['common', 'taldane'] }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a non-positive hp', () => {
    expect(ancestryEntrySchema.safeParse(makeAncestry({ hp: 0 })).success).toBe(false);
  });

  it('rejects an invalid size', () => {
    expect(
      ancestryEntrySchema.safeParse(makeAncestry({ size: 'colossal' })).success,
    ).toBe(false);
  });

  it('rejects an attribute outside the six slugs in boosts', () => {
    expect(
      ancestryEntrySchema.safeParse(makeAncestry({ boosts: ['strength'] })).success,
    ).toBe(false);
  });
});
