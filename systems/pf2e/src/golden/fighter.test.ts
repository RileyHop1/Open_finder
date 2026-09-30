import { sequenceRandomSource } from '@hearthtable/dice/testing';
import { describe, expect, it } from 'vitest';

import type { ArmorEntry, Attribute, WeaponEntry } from '../index.js';
import {
  attributeModifier,
  buildArmorClass,
  buildClassDc,
  buildPerception,
  buildSave,
  buildSkill,
  buildStrikeAttack,
  rollStrikeAttack,
  rollStrikeDamage,
} from '../index.js';
import { describeGolden } from './describeGolden.js';

/**
 * A level 1 Fighter, built by hand -- never a published stat block, per
 * ADR 0013's "golden characters are built by us" rule. Class proficiencies
 * below are confirmed against Archives of Nethys' Fighter class page
 * (Player Core): Perception Expert; Fortitude and Reflex Expert, Will
 * Trained; unarmed/simple/martial weapons Expert, advanced Trained; Class
 * DC Trained; all armor Trained. Ability scores and equipment are chosen
 * directly rather than derived through character creation -- which boosts
 * a character receives and from where is milestone 7's wizard, not
 * something this fixture models (see `attributes.ts`'s module doc).
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 18, dex: 14, con: 14, int: 10, wis: 12, cha: 10 } as const;

const ATTRIBUTE_MODIFIERS: Record<Attribute, number> = {
  str: attributeModifier(ABILITY_SCORES.str),
  dex: attributeModifier(ABILITY_SCORES.dex),
  con: attributeModifier(ABILITY_SCORES.con),
  int: attributeModifier(ABILITY_SCORES.int),
  wis: attributeModifier(ABILITY_SCORES.wis),
  cha: attributeModifier(ABILITY_SCORES.cha),
};

const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: '44444444-4444-5444-8444-444444444444',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-fighters-breastplate',
  name: "Invented Fighter's Breastplate",
  kind: 'armor',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'heavy',
  acBonus: 4,
  dexCap: 1,
  checkPenalty: -2,
  speedPenalty: 0,
};

const WEAPON: WeaponEntry = {
  id: '55555555-5555-5555-8555-555555555555',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-fighters-longsword',
  name: "Invented Fighter's Longsword",
  kind: 'weapon',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'martial',
  group: 'sword',
  damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
  hands: 1,
};

function buildStatistics() {
  return {
    ac: buildArmorClass({
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      armor: ARMOR,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    fortitude: buildSave({
      save: 'fortitude',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'expert',
      level: LEVEL,
    }),
    reflex: buildSave({
      save: 'reflex',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'expert',
      level: LEVEL,
    }),
    will: buildSave({
      save: 'will',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    perception: buildPerception({
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'expert',
      level: LEVEL,
    }),
    classDc: buildClassDc({
      keyAttribute: 'str',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    'skill:athletics': buildSkill({
      skill: 'athletics',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
      // Two circumstance bonuses of the same sign -- only the larger one
      // should apply, exercising the harness's suppression assertion
      // (ADR 0008's consequences section), not just its total.
      extraModifiers: [
        {
          slug: 'terrain',
          label: 'Favorable Terrain',
          type: 'circumstance',
          value: 2,
          source: 'Invented Terrain Effect',
          enabled: true,
        },
        {
          slug: 'lesser-terrain',
          label: 'Lesser Terrain Bonus',
          type: 'circumstance',
          value: 1,
          source: 'Invented Lesser Terrain Effect',
          enabled: true,
        },
      ],
    }),
    'skill:acrobatics': buildSkill({
      skill: 'acrobatics',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'untrained',
      level: LEVEL,
    }),
    'strike:longsword': buildStrikeAttack({
      weapon: WEAPON,
      attackAttribute: 'str',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'expert',
      level: LEVEL,
      attackNumber: 1,
    }),
  };
}

describeGolden(
  {
    name: 'Fighter (level 1)',
    statistics: {
      // 10 (base) + 1 (dex, capped from +2 by the breastplate's dexCap) + 3 (trained at level 1) + 4 (armor) = 18
      ac: {
        total: 18,
        modifiers: [
          { slug: 'base', applied: true },
          { slug: 'dexterity', applied: true },
          { slug: 'proficiency', applied: true },
          { slug: 'armor', applied: true },
        ],
      },
      // 2 (con) + 5 (expert at level 1) = 7
      fortitude: { total: 7 },
      // 2 (dex, uncapped -- only AC caps it) + 5 (expert at level 1) = 7
      reflex: { total: 7 },
      // 1 (wis) + 3 (trained at level 1) = 4
      will: { total: 4 },
      // 1 (wis) + 5 (expert at level 1) = 6
      perception: { total: 6 },
      // 10 (base) + 4 (str, the Fighter's chosen key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (str) + 3 (trained at level 1) + 2 (the larger circumstance bonus) = 9
      'skill:athletics': {
        total: 9,
        modifiers: [
          { slug: 'terrain', applied: true },
          { slug: 'lesser-terrain', applied: false, suppressedBy: 'terrain' },
        ],
      },
      // 2 (dex) + 0 (untrained) = 2
      'skill:acrobatics': { total: 2 },
      // 4 (str) + 5 (expert at level 1) = 9, no Multiple Attack Penalty on the first attack
      'strike:longsword': { total: 9 },
    },
  },
  buildStatistics,
);

describe('Fighter (level 1) -- strike roll', () => {
  it('rolls the longsword attack against an invented target AC', () => {
    const result = rollStrikeAttack({
      weapon: WEAPON,
      attackAttribute: 'str',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'expert',
      level: LEVEL,
      attackNumber: 1,
      dc: 20,
      rng: sequenceRandomSource([15]),
    });

    // attack total 9 (4 str + 5 expert at level 1); roll 15 + 9 = 24 vs DC 20: a success, not a critical.
    expect(result.statistic.total).toBe(9);
    expect(result.roll.total).toBe(24);
    expect(result.degree).toBe('success');
  });

  it('rolls the longsword damage on a hit, and doubles the total on a critical hit', () => {
    const hit = rollStrikeDamage({
      weapon: WEAPON,
      strikingDice: 0,
      abilityModifier: ATTRIBUTE_MODIFIERS.str,
      critical: false,
      rng: sequenceRandomSource([5]),
    });
    expect(hit.ok).toBe(true);
    if (hit.ok) {
      // 5 (weapon die) + 4 (str) = 9
      expect(hit.result.total).toBe(9);
    }

    const critical = rollStrikeDamage({
      weapon: WEAPON,
      strikingDice: 0,
      abilityModifier: ATTRIBUTE_MODIFIERS.str,
      critical: true,
      rng: sequenceRandomSource([5]),
    });
    expect(critical.ok).toBe(true);
    if (critical.ok) {
      // (5 + 4) * 2 = 18, doubling the whole total rather than just the die.
      expect(critical.result.total).toBe(18);
    }
  });
});
