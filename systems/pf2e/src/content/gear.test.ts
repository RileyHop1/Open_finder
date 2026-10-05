import { describe, expect, it } from 'vitest';

import { gearEntrySchema } from './gear.js';

function makeGear(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'equipment',
    slug: 'grappling-hook',
    name: 'Grappling Hook',
    kind: 'gear',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    ...overrides,
  };
}

describe('gearEntrySchema', () => {
  it('accepts a minimal well-formed gear entry', () => {
    expect(gearEntrySchema.safeParse(makeGear()).success).toBe(true);
  });

  it('accepts gear carrying rule elements (e.g. a wand granting a spell)', () => {
    const result = gearEntrySchema.safeParse(
      makeGear({
        slug: 'wand-of-magic-missile',
        name: 'Wand of Magic Missile',
        ruleElements: [{ kind: 'grantItem', packId: 'spells', slug: 'magic-missile' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a trait that is not a valid slug', () => {
    expect(gearEntrySchema.safeParse(makeGear({ traits: ['Not A Slug'] })).success).toBe(
      false,
    );
  });

  it('rejects a mismatched kind', () => {
    expect(gearEntrySchema.safeParse(makeGear({ kind: 'weapon' })).success).toBe(false);
  });

  it('leaves price, bulk, and level undefined when absent', () => {
    const result = gearEntrySchema.safeParse(makeGear());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceInCopper).toBeUndefined();
      expect(result.data.bulk).toBeUndefined();
      expect(result.data.level).toBeUndefined();
    }
  });

  it('accepts price, bulk, and level when present', () => {
    const result = gearEntrySchema.safeParse(
      makeGear({ priceInCopper: 50, bulk: 0.1, level: 1 }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceInCopper).toBe(50);
      expect(result.data.bulk).toBe(0.1);
      expect(result.data.level).toBe(1);
    }
  });

  it('rejects a negative price or bulk', () => {
    expect(gearEntrySchema.safeParse(makeGear({ priceInCopper: -1 })).success).toBe(
      false,
    );
    expect(gearEntrySchema.safeParse(makeGear({ bulk: -1 })).success).toBe(false);
  });
});
