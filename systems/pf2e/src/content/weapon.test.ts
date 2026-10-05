import { describe, expect, it } from 'vitest';

import {
  WEAPON_CATEGORIES,
  WEAPON_DAMAGE_TYPES,
  WEAPON_GROUPS,
  weaponEntrySchema,
} from './weapon.js';

function makeWeapon(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'equipment',
    slug: 'longsword',
    name: 'Longsword',
    kind: 'weapon',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    category: 'martial',
    group: 'sword',
    damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
    hands: 1,
    ...overrides,
  };
}

describe('weaponEntrySchema', () => {
  it('accepts a minimal well-formed melee weapon (no range, no reload)', () => {
    const result = weaponEntrySchema.safeParse(makeWeapon());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.range).toBeUndefined();
      expect(result.data.reload).toBeUndefined();
    }
  });

  it.each(WEAPON_CATEGORIES)('accepts the %s category', (category) => {
    expect(weaponEntrySchema.safeParse(makeWeapon({ category })).success).toBe(true);
  });

  it.each(WEAPON_GROUPS)('accepts the %s group', (group) => {
    expect(weaponEntrySchema.safeParse(makeWeapon({ group })).success).toBe(true);
  });

  it.each(WEAPON_DAMAGE_TYPES)('accepts %s as a base damage type', (damageType) => {
    const result = weaponEntrySchema.safeParse(
      makeWeapon({ damage: { diceNumber: 1, dieFaces: 6, damageType } }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an energy damage type as a weapon base type -- that is an elemental rune, not the base', () => {
    const result = weaponEntrySchema.safeParse(
      makeWeapon({ damage: { diceNumber: 1, dieFaces: 6, damageType: 'fire' } }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts a two-handed weapon', () => {
    expect(weaponEntrySchema.safeParse(makeWeapon({ hands: 2 })).success).toBe(true);
  });

  it('rejects a hands value other than 1 or 2', () => {
    expect(weaponEntrySchema.safeParse(makeWeapon({ hands: 3 })).success).toBe(false);
  });

  it('accepts a ranged weapon with range and reload', () => {
    const result = weaponEntrySchema.safeParse(
      makeWeapon({
        slug: 'crossbow',
        name: 'Crossbow',
        group: 'firearm',
        damage: { diceNumber: 1, dieFaces: 8, damageType: 'piercing' },
        range: 120,
        reload: 1,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a thrown weapon with a range but no reload', () => {
    const result = weaponEntrySchema.safeParse(
      makeWeapon({
        slug: 'dart',
        name: 'Dart',
        category: 'simple',
        group: 'dart',
        damage: { diceNumber: 1, dieFaces: 4, damageType: 'piercing' },
        range: 20,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a die size PF2e does not use', () => {
    const result = weaponEntrySchema.safeParse(
      makeWeapon({ damage: { diceNumber: 1, dieFaces: 20, damageType: 'slashing' } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a category outside the closed vocabulary', () => {
    expect(weaponEntrySchema.safeParse(makeWeapon({ category: 'exotic' })).success).toBe(
      false,
    );
  });

  it('leaves price, bulk, and level undefined when absent', () => {
    const result = weaponEntrySchema.safeParse(makeWeapon());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceInCopper).toBeUndefined();
      expect(result.data.bulk).toBeUndefined();
      expect(result.data.level).toBeUndefined();
    }
  });

  it('accepts price, bulk, and level when present', () => {
    const result = weaponEntrySchema.safeParse(
      makeWeapon({ priceInCopper: 100, bulk: 1, level: 0 }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceInCopper).toBe(100);
      expect(result.data.bulk).toBe(1);
      expect(result.data.level).toBe(0);
    }
  });

  it('rejects a negative price or bulk', () => {
    expect(weaponEntrySchema.safeParse(makeWeapon({ priceInCopper: -1 })).success).toBe(
      false,
    );
    expect(weaponEntrySchema.safeParse(makeWeapon({ bulk: -1 })).success).toBe(false);
  });
});
