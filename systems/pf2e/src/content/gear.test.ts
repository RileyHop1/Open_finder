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
});
