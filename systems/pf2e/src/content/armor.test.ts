import { describe, expect, it } from 'vitest';

import { ARMOR_CATEGORIES, ARMOR_GROUPS, armorEntrySchema } from './armor.js';

function makeArmor(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'equipment',
    slug: 'chain-shirt',
    name: 'Chain Shirt',
    kind: 'armor',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    category: 'light',
    group: 'chain',
    acBonus: 2,
    ...overrides,
  };
}

describe('armorEntrySchema', () => {
  it('accepts a minimal well-formed armor, defaulting penalties to 0', () => {
    const result = armorEntrySchema.safeParse(makeArmor());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.checkPenalty).toBe(0);
      expect(result.data.speedPenalty).toBe(0);
      expect(result.data.dexCap).toBeUndefined();
      expect(result.data.strength).toBeUndefined();
    }
  });

  it.each(ARMOR_CATEGORIES)('accepts the %s category', (category) => {
    expect(armorEntrySchema.safeParse(makeArmor({ category })).success).toBe(true);
  });

  it.each(ARMOR_GROUPS)('accepts the %s group', (group) => {
    expect(armorEntrySchema.safeParse(makeArmor({ group })).success).toBe(true);
  });

  it('accepts armor with no group (some unarmored options)', () => {
    const { group: _group, ...rest } = makeArmor({ category: 'unarmored', acBonus: 0 });
    expect(armorEntrySchema.safeParse(rest).success).toBe(true);
  });

  it('accepts heavy armor with a dex cap, penalties, and a strength requirement', () => {
    const result = armorEntrySchema.safeParse(
      makeArmor({
        slug: 'full-plate',
        name: 'Full Plate',
        category: 'heavy',
        group: 'plate',
        acBonus: 6,
        dexCap: 0,
        checkPenalty: -3,
        speedPenalty: -10,
        strength: 18,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a positive checkPenalty or speedPenalty -- penalties are zero or negative', () => {
    expect(armorEntrySchema.safeParse(makeArmor({ checkPenalty: 1 })).success).toBe(
      false,
    );
    expect(armorEntrySchema.safeParse(makeArmor({ speedPenalty: 1 })).success).toBe(
      false,
    );
  });

  it('rejects a negative acBonus', () => {
    expect(armorEntrySchema.safeParse(makeArmor({ acBonus: -1 })).success).toBe(false);
  });

  it('rejects a category outside the closed vocabulary', () => {
    expect(armorEntrySchema.safeParse(makeArmor({ category: 'exotic' })).success).toBe(
      false,
    );
  });
});
