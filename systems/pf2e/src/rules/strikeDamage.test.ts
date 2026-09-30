import type { RandomSource } from '@hearthtable/dice';
import { describe, expect, it } from 'vitest';

import type { WeaponEntry } from '../content/weapon.js';
import { buildStrikeDamage, rollStrikeDamage } from './strikeDamage.js';

// Synthetic, invented fixtures throughout (ADR 0013).
const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

function makeWeapon(overrides: Partial<WeaponEntry> = {}): WeaponEntry {
  return {
    id: '33333333-3333-5333-8333-333333333333',
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'equipment',
    slug: 'invented-sword',
    name: 'Invented Sword',
    kind: 'weapon',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    category: 'martial',
    group: 'sword',
    damage: { diceNumber: 1, dieFaces: 6, damageType: 'slashing' },
    hands: 1,
    ...overrides,
  };
}

/** A scripted RNG returning one value per call, in order -- local to this test file since `@hearthtable/dice`'s own equivalent is not exported outside its package. */
function sequenceRandomSource(values: readonly number[]): RandomSource {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) {
      throw new Error(`sequenceRandomSource exhausted after ${index} call(s)`);
    }
    index += 1;
    return value;
  };
}

describe('buildStrikeDamage', () => {
  it('builds the weapon dice plus ability modifier as a single component', () => {
    const components = buildStrikeDamage({
      weapon: makeWeapon(),
      strikingDice: 0,
      abilityModifier: 4,
      critical: false,
    });

    expect(components).toEqual([{ expression: '1d6+4', damageType: 'slashing' }]);
  });

  it('omits a +0 modifier term', () => {
    const components = buildStrikeDamage({
      weapon: makeWeapon(),
      strikingDice: 0,
      abilityModifier: 0,
      critical: false,
    });

    expect(components[0]?.expression).toBe('1d6');
  });

  it('writes a negative modifier inline', () => {
    const components = buildStrikeDamage({
      weapon: makeWeapon(),
      strikingDice: 0,
      abilityModifier: -1,
      critical: false,
    });

    expect(components[0]?.expression).toBe('1d6-1');
  });

  it.each([
    [0, '1d6+4'],
    [1, '2d6+4'],
    [2, '3d6+4'],
    [3, '4d6+4'],
  ] as const)(
    'a striking rune count of %s adds that many weapon dice (%s)',
    (strikingDice, expression) => {
      const components = buildStrikeDamage({
        weapon: makeWeapon(),
        strikingDice,
        abilityModifier: 4,
        critical: false,
      });

      expect(components[0]?.expression).toBe(expression);
    },
  );

  it('does not upgrade the weapon die on a critical hit without fatal', () => {
    const components = buildStrikeDamage({
      weapon: makeWeapon(),
      strikingDice: 0,
      abilityModifier: 4,
      critical: true,
    });

    expect(components).toEqual([{ expression: '1d6+4', damageType: 'slashing' }]);
  });

  it('swaps the weapon component for an upgraded fatal expression on a critical hit', () => {
    const components = buildStrikeDamage({
      weapon: makeWeapon({ traits: ['fatal-d8'] }),
      strikingDice: 0,
      abilityModifier: 4,
      critical: true,
    });

    // base dice (1) + striking (0) + fatal's extra die (1) = 2 dice, at fatal's d8.
    expect(components).toEqual([{ expression: '2d8+4', damageType: 'slashing' }]);
  });

  it('leaves the base weapon expression alone for fatal on a non-critical hit', () => {
    const components = buildStrikeDamage({
      weapon: makeWeapon({ traits: ['fatal-d8'] }),
      strikingDice: 0,
      abilityModifier: 4,
      critical: false,
    });

    expect(components).toEqual([{ expression: '1d6+4', damageType: 'slashing' }]);
  });

  it('scales fatal dice count with striking runes the same way as the base weapon', () => {
    const components = buildStrikeDamage({
      weapon: makeWeapon({ traits: ['fatal-d8'] }),
      strikingDice: 2,
      abilityModifier: 4,
      critical: true,
    });

    // base dice (1) + striking (2) + fatal's extra die (1) = 4 dice at d8.
    expect(components).toEqual([{ expression: '4d8+4', damageType: 'slashing' }]);
  });

  it('adds a critical-only deadly component with no ability modifier', () => {
    const components = buildStrikeDamage({
      weapon: makeWeapon({ traits: ['deadly-d10'] }),
      strikingDice: 0,
      abilityModifier: 4,
      critical: true,
    });

    expect(components).toEqual([
      { expression: '1d6+4', damageType: 'slashing' },
      { expression: '1d10', damageType: 'slashing', doubling: 'criticalOnly' },
    ]);
  });

  it('does not add a second deadly die for a plain striking rune', () => {
    const components = buildStrikeDamage({
      weapon: makeWeapon({ traits: ['deadly-d10'] }),
      strikingDice: 1,
      abilityModifier: 4,
      critical: true,
    });

    expect(components[1]).toEqual({
      expression: '1d10',
      damageType: 'slashing',
      doubling: 'criticalOnly',
    });
  });

  it.each([
    [2, '2d10'],
    [3, '3d10'],
  ] as const)(
    'greater/major striking (strikingDice %s) does add extra deadly dice (%s)',
    (strikingDice, expression) => {
      const components = buildStrikeDamage({
        weapon: makeWeapon({ traits: ['deadly-d10'] }),
        strikingDice,
        abilityModifier: 4,
        critical: true,
      });

      expect(components[1]).toEqual({
        expression,
        damageType: 'slashing',
        doubling: 'criticalOnly',
      });
    },
  );

  it('folds in extraComponents, e.g. a caller-supplied splash component', () => {
    const components = buildStrikeDamage({
      weapon: makeWeapon({ traits: ['splash'] }),
      strikingDice: 0,
      abilityModifier: 0,
      critical: false,
      extraComponents: [
        { expression: '1', damageType: 'splash', doubling: 'neverDoubled' },
      ],
    });

    expect(components).toEqual([
      { expression: '1d6', damageType: 'slashing' },
      { expression: '1', damageType: 'splash', doubling: 'neverDoubled' },
    ]);
  });
});

describe('rollStrikeDamage', () => {
  it('rolls the weapon dice and totals the result', () => {
    const result = rollStrikeDamage({
      weapon: makeWeapon(),
      strikingDice: 0,
      abilityModifier: 4,
      critical: false,
      rng: sequenceRandomSource([5]),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.total).toBe(9);
      expect(result.result.damage).toEqual({ slashing: 9 });
    }
  });

  it('doubles the whole total on a critical hit, including the ability modifier', () => {
    const result = rollStrikeDamage({
      weapon: makeWeapon(),
      strikingDice: 0,
      abilityModifier: 4,
      critical: true,
      rng: sequenceRandomSource([5]),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // (5 + 4) * 2 = 18, not just the dice doubled and the modifier flat.
      expect(result.result.total).toBe(18);
    }
  });

  it('never doubles a deadly die even on a critical hit', () => {
    const result = rollStrikeDamage({
      weapon: makeWeapon({ traits: ['deadly-d10'] }),
      strikingDice: 0,
      abilityModifier: 0,
      critical: true,
      rng: sequenceRandomSource([6, 10]),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // weapon die (6) doubled to 12, plus the deadly die (10) never doubled = 22.
      expect(result.result.total).toBe(22);
    }
  });

  it('does not roll a deadly die at all on a non-critical hit', () => {
    const result = rollStrikeDamage({
      weapon: makeWeapon({ traits: ['deadly-d10'] }),
      strikingDice: 0,
      abilityModifier: 0,
      critical: false,
      rng: sequenceRandomSource([6]),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.total).toBe(6);
    }
  });
});
