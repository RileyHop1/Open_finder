import type { ArmorEntry, Attribute, WeaponEntry } from '../index.js';
import {
  attributeModifier,
  buildArmorClass,
  buildClassDc,
  buildPerception,
  buildSave,
  buildSkill,
  buildStrikeAttack,
} from '../index.js';
import { describeGolden } from './describeGolden.js';

/**
 * A level 1 Sorcerer, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys'
 * Sorcerer class page (Player Core): Perception Trained; Fortitude
 * Trained, Reflex Trained, Will Expert; unarmed/simple weapons Trained (no
 * martial); unarmored defense Trained only (no light/medium/heavy); Class
 * DC Trained. Key ability: Charisma.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 18 } as const;

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

/** No armor proficiency at level 1 -- this represents the Sorcerer's unarmored defense, with no item bonus of its own. */
const ARMOR: ArmorEntry = {
  id: '00000002-2222-5333-8444-000000000006',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-unarmored-garb',
  name: 'Invented Unarmored Garb',
  kind: 'armor',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'unarmored',
  acBonus: 0,
  checkPenalty: 0,
  speedPenalty: 0,
};

const WEAPON: WeaponEntry = {
  id: '00000003-3333-5444-8555-000000000007',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-sorcerers-dagger',
  name: "Invented Sorcerer's Dagger",
  kind: 'weapon',
  provenance: PROVENANCE,
  traits: ['finesse'],
  ruleElements: [],
  description: '',
  category: 'simple',
  group: 'knife',
  damage: { diceNumber: 1, dieFaces: 4, damageType: 'piercing' },
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
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    reflex: buildSave({
      save: 'reflex',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    will: buildSave({
      save: 'will',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'expert',
      level: LEVEL,
    }),
    perception: buildPerception({
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    classDc: buildClassDc({
      keyAttribute: 'cha',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    'skill:arcana': buildSkill({
      skill: 'arcana',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    'skill:athletics': buildSkill({
      skill: 'athletics',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'untrained',
      level: LEVEL,
    }),
    // A finesse dagger's attack uses Dexterity, since it beats this build's Strength.
    'strike:dagger': buildStrikeAttack({
      weapon: WEAPON,
      attackAttribute: 'dex',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
      attackNumber: 1,
    }),
  };
}

describeGolden(
  {
    name: 'Sorcerer (level 1)',
    statistics: {
      // 10 (base) + 2 (dex, uncapped -- no armor at all) + 3 (trained at level 1) + 0 (no armor item bonus) = 15
      ac: { total: 15 },
      // 1 (con) + 3 (trained at level 1) = 4
      fortitude: { total: 4 },
      // 2 (dex) + 3 (trained at level 1) = 5
      reflex: { total: 5 },
      // 0 (wis) + 5 (expert at level 1) = 5
      will: { total: 5 },
      // 0 (wis) + 3 (trained at level 1) = 3
      perception: { total: 3 },
      // 10 (base) + 4 (cha, the Sorcerer's key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // Arcana is Intelligence-based, not Charisma-based -- 0 (int) + 3 (trained at level 1) = 3
      'skill:arcana': { total: 3 },
      // 0 (str) + 0 (untrained) = 0
      'skill:athletics': { total: 0 },
      // 2 (dex) + 3 (trained at level 1) = 5, no Multiple Attack Penalty on the first attack
      'strike:dagger': { total: 5 },
    },
  },
  buildStatistics,
);
