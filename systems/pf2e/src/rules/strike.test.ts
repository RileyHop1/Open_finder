import type { RandomSource } from '@hearthtable/dice';
import { describe, expect, it } from 'vitest';

import type { WeaponEntry } from '../content/weapon.js';
import { buildStrikeAttack, rollStrikeAttack } from './strike.js';

// Synthetic, invented fixtures throughout (ADR 0013).
const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

function makeWeapon(overrides: Partial<WeaponEntry> = {}): WeaponEntry {
  return {
    id: '22222222-2222-5222-8222-222222222222',
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
    damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
    hands: 1,
    ...overrides,
  };
}

const ZERO_ATTRIBUTES = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

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

describe('buildStrikeAttack', () => {
  it('sums the attack attribute and proficiency', () => {
    const statistic = buildStrikeAttack({
      weapon: makeWeapon(),
      attackAttribute: 'str',
      attributeModifiers: { ...ZERO_ATTRIBUTES, str: 4 },
      proficiencyRank: 'trained',
      level: 3,
      attackNumber: 1,
    });

    // 4 (str) + (3 + 2) (trained) = 9
    expect(statistic.total).toBe(9);
  });

  it('omits the Multiple Attack Penalty line entirely on the first attack', () => {
    const statistic = buildStrikeAttack({
      weapon: makeWeapon(),
      attackAttribute: 'str',
      attributeModifiers: ZERO_ATTRIBUTES,
      proficiencyRank: 'untrained',
      level: 1,
      attackNumber: 1,
    });

    expect(
      statistic.modifiers.some((modifier) => modifier.slug === 'multiple-attack-penalty'),
    ).toBe(false);
  });

  it.each([
    [2, -5],
    [3, -10],
  ] as const)(
    'attack number %s gets a %s penalty for a non-agile weapon',
    (attackNumber, penalty) => {
      const statistic = buildStrikeAttack({
        weapon: makeWeapon(),
        attackAttribute: 'str',
        attributeModifiers: ZERO_ATTRIBUTES,
        proficiencyRank: 'untrained',
        level: 1,
        attackNumber,
      });

      expect(statistic.total).toBe(penalty);
    },
  );

  it.each([
    [2, -4],
    [3, -8],
  ] as const)(
    'halves the penalty on attack number %s to %s for an agile weapon',
    (attackNumber, penalty) => {
      const statistic = buildStrikeAttack({
        weapon: makeWeapon({ traits: ['agile'] }),
        attackAttribute: 'str',
        attributeModifiers: ZERO_ATTRIBUTES,
        proficiencyRank: 'untrained',
        level: 1,
        attackNumber,
      });

      expect(statistic.total).toBe(penalty);
    },
  );

  it('folds in extraModifiers, e.g. a potency rune item bonus', () => {
    const statistic = buildStrikeAttack({
      weapon: makeWeapon(),
      attackAttribute: 'dex',
      attributeModifiers: ZERO_ATTRIBUTES,
      proficiencyRank: 'untrained',
      level: 1,
      attackNumber: 1,
      extraModifiers: [
        {
          slug: 'weapon-potency',
          label: 'Weapon Potency',
          type: 'item',
          value: 1,
          source: 'Invented +1 Striking Sword',
          enabled: true,
        },
      ],
    });

    expect(statistic.total).toBe(1);
  });

  it('has no base-10 line, unlike AC', () => {
    const statistic = buildStrikeAttack({
      weapon: makeWeapon(),
      attackAttribute: 'str',
      attributeModifiers: ZERO_ATTRIBUTES,
      proficiencyRank: 'untrained',
      level: 1,
      attackNumber: 1,
    });

    expect(statistic.modifiers.some((modifier) => modifier.slug === 'base')).toBe(false);
  });
});

describe('rollStrikeAttack', () => {
  it('rolls 1d20 plus the attack total and reports the total', () => {
    const result = rollStrikeAttack({
      weapon: makeWeapon(),
      attackAttribute: 'str',
      attributeModifiers: { ...ZERO_ATTRIBUTES, str: 4 },
      proficiencyRank: 'trained',
      level: 3,
      attackNumber: 1,
      dc: 20,
      rng: sequenceRandomSource([12]),
    });

    // attack total: 4 (str) + 5 (trained at level 3) = 9; roll: 12 + 9 = 21
    expect(result.statistic.total).toBe(9);
    expect(result.roll.total).toBe(21);
    expect(result.degree).toBe('success');
  });

  it('shifts a success to a critical success on a natural 20', () => {
    const result = rollStrikeAttack({
      weapon: makeWeapon(),
      attackAttribute: 'str',
      attributeModifiers: ZERO_ATTRIBUTES,
      proficiencyRank: 'untrained',
      level: 1,
      attackNumber: 1,
      dc: 15,
      rng: sequenceRandomSource([20]),
    });

    // total is 20, five short of DC 15 + 10, so this would be a plain
    // success without the natural-20 shift.
    expect(result.degree).toBe('criticalSuccess');
  });

  it('shifts a failure to a critical failure on a natural 1', () => {
    const result = rollStrikeAttack({
      weapon: makeWeapon(),
      attackAttribute: 'str',
      attributeModifiers: { ...ZERO_ATTRIBUTES, str: 9 },
      proficiencyRank: 'untrained',
      level: 1,
      attackNumber: 1,
      dc: 15,
      rng: sequenceRandomSource([1]),
    });

    // total is 10, within 10 of DC 15, so this would be a plain failure
    // without the natural-1 shift.
    expect(result.degree).toBe('criticalFailure');
  });

  it('applies the Multiple Attack Penalty to the rolled total, not just the statistic', () => {
    const result = rollStrikeAttack({
      weapon: makeWeapon(),
      attackAttribute: 'str',
      attributeModifiers: { ...ZERO_ATTRIBUTES, str: 4 },
      proficiencyRank: 'trained',
      level: 3,
      attackNumber: 2,
      dc: 20,
      rng: sequenceRandomSource([12]),
    });

    // attack total: 9 (as above) - 5 (MAP) = 4; roll: 12 + 4 = 16
    expect(result.statistic.total).toBe(4);
    expect(result.roll.total).toBe(16);
  });
});
