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
 * A level 1 Bard, built by hand -- never a published stat block (ADR 0013).
 * Initial proficiencies confirmed against Archives of Nethys' Bard class
 * page (Player Core): Perception Expert; Fortitude Trained, Reflex
 * Trained, Will Expert; unarmed/simple/martial weapons Trained; Class DC
 * Trained; light armor and unarmored defense Trained (no medium or heavy).
 * Key ability: Charisma.
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

const ARMOR: ArmorEntry = {
  id: '66666666-6666-5666-8666-666666666666',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-bards-leathers',
  name: "Invented Bard's Leathers",
  kind: 'armor',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'light',
  acBonus: 3,
  dexCap: 4,
  checkPenalty: 0,
  speedPenalty: 0,
};

const WEAPON: WeaponEntry = {
  id: '77777777-7777-5777-8777-777777777777',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-bards-rapier',
  name: "Invented Bard's Rapier",
  kind: 'weapon',
  provenance: PROVENANCE,
  traits: ['finesse'],
  ruleElements: [],
  description: '',
  category: 'martial',
  group: 'sword',
  damage: { diceNumber: 1, dieFaces: 6, damageType: 'piercing' },
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
      proficiencyRank: 'expert',
      level: LEVEL,
    }),
    classDc: buildClassDc({
      keyAttribute: 'cha',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    'skill:performance': buildSkill({
      skill: 'performance',
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
    // A finesse rapier's attack uses Dexterity, since it beats this build's Strength.
    'strike:rapier': buildStrikeAttack({
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
    name: 'Bard (level 1)',
    statistics: {
      // 10 (base) + 2 (dex, uncapped -- this armor's dexCap is 4) + 3 (trained at level 1) + 3 (armor) = 18
      ac: { total: 18 },
      // 1 (con) + 3 (trained at level 1) = 4
      fortitude: { total: 4 },
      // 2 (dex) + 3 (trained at level 1) = 5
      reflex: { total: 5 },
      // 0 (wis) + 5 (expert at level 1) = 5
      will: { total: 5 },
      // 0 (wis) + 5 (expert at level 1) = 5
      perception: { total: 5 },
      // 10 (base) + 4 (cha, the Bard's key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (cha) + 3 (trained at level 1) = 7
      'skill:performance': { total: 7 },
      // 0 (str) + 0 (untrained) = 0
      'skill:athletics': { total: 0 },
      // 2 (dex) + 3 (trained at level 1) = 5, no Multiple Attack Penalty on the first attack
      'strike:rapier': { total: 5 },
    },
  },
  buildStatistics,
);
