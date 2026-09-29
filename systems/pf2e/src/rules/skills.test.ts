import { describe, expect, it } from 'vitest';

import { buildClassDc, buildPerception, buildSkill, SKILLS } from './skills.js';

const ZERO_ATTRIBUTES = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

describe('buildSkill -- named skills use their fixed attribute', () => {
  it.each([
    ['athletics', 'str'],
    ['acrobatics', 'dex'],
    ['arcana', 'int'],
    ['diplomacy', 'cha'],
    ['medicine', 'wis'],
  ] as const)('%s uses the %s modifier', (skill, attribute) => {
    const attributeModifiers = { ...ZERO_ATTRIBUTES, [attribute]: 3 };

    const statistic = buildSkill({
      skill,
      attributeModifiers,
      proficiencyRank: 'untrained',
      level: 1,
    });

    expect(statistic.total).toBe(3);
  });

  it('every named skill in SKILLS has a fixed attribute distinct from an arbitrary default', () => {
    expect(SKILLS).toHaveLength(16);
    expect(SKILLS).toContain('athletics');
    expect(SKILLS).not.toContain('lore');
  });
});

describe('buildSkill -- a Lore skill always uses Intelligence', () => {
  it.each(['academia-lore', 'farming-lore', 'anything-not-in-the-named-list'])(
    '%s falls back to Intelligence',
    (skill) => {
      const statistic = buildSkill({
        skill,
        attributeModifiers: { ...ZERO_ATTRIBUTES, int: 4 },
        proficiencyRank: 'untrained',
        level: 1,
      });

      expect(statistic.total).toBe(4);
    },
  );
});

describe('buildSkill -- proficiency and extras', () => {
  it('adds proficiency on top of the attribute modifier', () => {
    const statistic = buildSkill({
      skill: 'stealth',
      attributeModifiers: { ...ZERO_ATTRIBUTES, dex: 3 },
      proficiencyRank: 'trained',
      level: 4,
    });

    // 3 (dex) + (4 + 2) (trained) = 9
    expect(statistic.total).toBe(9);
  });

  it('folds in extraModifiers, e.g. a circumstance penalty from armor', () => {
    const statistic = buildSkill({
      skill: 'stealth',
      attributeModifiers: ZERO_ATTRIBUTES,
      proficiencyRank: 'untrained',
      level: 1,
      extraModifiers: [
        {
          slug: 'armor-check-penalty',
          label: 'Armor Check Penalty',
          type: 'item',
          value: -2,
          source: 'Invented Armor',
          enabled: true,
        },
      ],
    });

    expect(statistic.total).toBe(-2);
  });

  it('has no base-10 line', () => {
    const statistic = buildSkill({
      skill: 'athletics',
      attributeModifiers: ZERO_ATTRIBUTES,
      proficiencyRank: 'untrained',
      level: 1,
    });

    expect(statistic.modifiers.some((modifier) => modifier.slug === 'base')).toBe(false);
  });
});

describe('buildPerception', () => {
  it('is always Wisdom-based', () => {
    const statistic = buildPerception({
      attributeModifiers: { ...ZERO_ATTRIBUTES, wis: 2 },
      proficiencyRank: 'untrained',
      level: 1,
    });

    expect(statistic.total).toBe(2);
  });

  it('adds proficiency on top of Wisdom', () => {
    const statistic = buildPerception({
      attributeModifiers: { ...ZERO_ATTRIBUTES, wis: 1 },
      proficiencyRank: 'expert',
      level: 9,
    });

    // 1 (wis) + (9 + 4) (expert) = 14
    expect(statistic.total).toBe(14);
  });
});

describe('buildClassDc', () => {
  it('sums base 10, the key attribute, and proficiency', () => {
    const statistic = buildClassDc({
      keyAttribute: 'str',
      attributeModifiers: { ...ZERO_ATTRIBUTES, str: 4 },
      proficiencyRank: 'trained',
      level: 3,
    });

    // 10 (base) + 4 (str) + (3 + 2) (trained) = 19
    expect(statistic.total).toBe(19);
  });

  it('uses whichever key attribute the caller resolved, not a fixed one', () => {
    const statisticStr = buildClassDc({
      keyAttribute: 'str',
      attributeModifiers: { ...ZERO_ATTRIBUTES, str: 3, dex: 1 },
      proficiencyRank: 'untrained',
      level: 1,
    });
    const statisticDex = buildClassDc({
      keyAttribute: 'dex',
      attributeModifiers: { ...ZERO_ATTRIBUTES, str: 3, dex: 1 },
      proficiencyRank: 'untrained',
      level: 1,
    });

    expect(statisticStr.total).toBe(13);
    expect(statisticDex.total).toBe(11);
  });

  it('folds in extraModifiers', () => {
    const statistic = buildClassDc({
      keyAttribute: 'cha',
      attributeModifiers: ZERO_ATTRIBUTES,
      proficiencyRank: 'untrained',
      level: 1,
      extraModifiers: [
        {
          slug: 'invented-bonus',
          label: 'Invented Bonus',
          type: 'status',
          value: 1,
          source: 'Invented Effect',
          enabled: true,
        },
      ],
    });

    expect(statistic.total).toBe(11);
  });
});
