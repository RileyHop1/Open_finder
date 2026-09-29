import { describe, expect, it } from 'vitest';

import type { ArmorEntry } from '../content/armor.js';
import { buildArmorClass, buildSave } from './defenses.js';

// Synthetic, invented fixtures throughout (ADR 0013).
const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

function makeArmor(overrides: Partial<ArmorEntry> = {}): ArmorEntry {
  return {
    id: '11111111-1111-5111-8111-111111111111',
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'equipment',
    slug: 'invented-armor',
    name: 'Invented Armor',
    kind: 'armor',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    category: 'light',
    acBonus: 2,
    checkPenalty: 0,
    speedPenalty: 0,
    ...overrides,
  };
}

const NO_DEX_CAP_ATTRIBUTES = { str: 0, dex: 4, con: 0, int: 0, wis: 0, cha: 0 };

describe('buildArmorClass', () => {
  it('sums base 10, Dexterity, proficiency, and the armor item bonus', () => {
    const statistic = buildArmorClass({
      attributeModifiers: NO_DEX_CAP_ATTRIBUTES,
      armor: makeArmor({ acBonus: 3 }),
      proficiencyRank: 'trained',
      level: 5,
    });

    // 10 (base) + 4 (dex) + (5 + 2) (trained proficiency) + 3 (armor) = 24
    expect(statistic.total).toBe(24);
  });

  it("caps Dexterity's contribution at the armor's dexCap", () => {
    const statistic = buildArmorClass({
      attributeModifiers: { ...NO_DEX_CAP_ATTRIBUTES, dex: 5 },
      armor: makeArmor({ dexCap: 2 }),
      proficiencyRank: 'untrained',
      level: 1,
    });

    // 10 (base) + 2 (dex, capped from 5) + 0 (untrained) + 2 (armor) = 14
    expect(statistic.total).toBe(14);
  });

  it('never caps a negative Dexterity modifier upward', () => {
    const statistic = buildArmorClass({
      attributeModifiers: { ...NO_DEX_CAP_ATTRIBUTES, dex: -1 },
      armor: makeArmor({ dexCap: 0 }),
      proficiencyRank: 'untrained',
      level: 1,
    });

    // 10 (base) + -1 (dex, a cap of 0 does not raise it) + 0 + 2 (armor) = 11
    expect(statistic.total).toBe(11);
  });

  it('leaves Dexterity uncapped when the armor has no dexCap', () => {
    const statistic = buildArmorClass({
      attributeModifiers: { ...NO_DEX_CAP_ATTRIBUTES, dex: 8 },
      armor: makeArmor(),
      proficiencyRank: 'untrained',
      level: 1,
    });

    // 10 (base) + 8 (dex, uncapped) + 0 + 2 (armor) = 20
    expect(statistic.total).toBe(20);
  });

  it('omits an item-bonus line for unarmored (acBonus 0)', () => {
    const statistic = buildArmorClass({
      attributeModifiers: NO_DEX_CAP_ATTRIBUTES,
      armor: makeArmor({ category: 'unarmored', acBonus: 0 }),
      proficiencyRank: 'trained',
      level: 1,
    });

    expect(statistic.modifiers.some((modifier) => modifier.slug === 'armor')).toBe(false);
  });

  it('includes the base 10 as a visible, always-applying modifier in the breakdown', () => {
    const statistic = buildArmorClass({
      attributeModifiers: NO_DEX_CAP_ATTRIBUTES,
      armor: makeArmor(),
      proficiencyRank: 'trained',
      level: 1,
    });

    const base = statistic.modifiers.find((modifier) => modifier.slug === 'base');
    expect(base).toMatchObject({ value: 10, type: 'untyped', applied: true });
  });

  it('folds in extraModifiers, e.g. a shield circumstance bonus', () => {
    const statistic = buildArmorClass({
      attributeModifiers: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      armor: makeArmor({ acBonus: 0 }),
      proficiencyRank: 'untrained',
      level: 1,
      extraModifiers: [
        {
          slug: 'shield',
          label: 'Shield',
          type: 'circumstance',
          value: 2,
          source: 'Invented Shield',
          enabled: true,
        },
      ],
    });

    // 10 (base) + 0 (dex) + 0 (untrained) + 2 (shield) = 12
    expect(statistic.total).toBe(12);
  });
});

describe('buildSave', () => {
  it.each([
    ['fortitude', 'con'],
    ['reflex', 'dex'],
    ['will', 'wis'],
  ] as const)('%s uses the %s modifier', (save, attribute) => {
    const attributeModifiers = {
      str: 0,
      dex: 0,
      con: 0,
      int: 0,
      wis: 0,
      cha: 0,
      [attribute]: 3,
    };

    const statistic = buildSave({
      save,
      attributeModifiers,
      proficiencyRank: 'untrained',
      level: 1,
    });

    // untrained contributes 0, so the total is exactly the attribute modifier.
    expect(statistic.total).toBe(3);
  });

  it('adds proficiency on top of the attribute modifier', () => {
    const statistic = buildSave({
      save: 'fortitude',
      attributeModifiers: { str: 0, dex: 0, con: 2, int: 0, wis: 0, cha: 0 },
      proficiencyRank: 'expert',
      level: 7,
    });

    // 2 (con) + (7 + 4) (expert proficiency) = 13
    expect(statistic.total).toBe(13);
  });

  it('folds in extraModifiers, e.g. a status penalty from a spell', () => {
    const statistic = buildSave({
      save: 'will',
      attributeModifiers: { str: 0, dex: 0, con: 0, int: 0, wis: 1, cha: 0 },
      proficiencyRank: 'trained',
      level: 1,
      extraModifiers: [
        {
          slug: 'frightened',
          label: 'Frightened',
          type: 'status',
          value: -1,
          source: 'Invented Fear Effect',
          enabled: true,
        },
      ],
    });

    // 1 (wis) + (1 + 2) (trained) + -1 (frightened) = 3
    expect(statistic.total).toBe(3);
  });

  it('has no base-10 line, unlike AC', () => {
    const statistic = buildSave({
      save: 'reflex',
      attributeModifiers: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      proficiencyRank: 'untrained',
      level: 1,
    });

    expect(statistic.modifiers.some((modifier) => modifier.slug === 'base')).toBe(false);
  });
});
