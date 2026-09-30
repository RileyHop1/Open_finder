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
 * A level 1 Barbarian, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys'
 * Barbarian class page (Player Core 2): Perception Expert; Fortitude
 * Expert, Reflex Trained, Will Expert (PF2e deliberately gives Barbarians
 * good Fortitude *and* Will, unlike the fragile-minded trope); unarmed/
 * simple/martial weapons Trained; light and medium armor Trained (no
 * heavy); Class DC Trained. Key ability: Strength.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 18, dex: 12, con: 16, int: 10, wis: 10, cha: 10 } as const;

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
  publication: 'Pathfinder Player Core 2',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: '77777777-8888-5999-8aaa-bbbbbbbbbbbb',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-barbarians-hide',
  name: "Invented Barbarian's Hide",
  kind: 'armor',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'medium',
  acBonus: 4,
  dexCap: 2,
  checkPenalty: -2,
  speedPenalty: 0,
};

const WEAPON: WeaponEntry = {
  id: '88888888-9999-5aaa-8bbb-cccccccccccc',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-barbarians-greataxe',
  name: "Invented Barbarian's Greataxe",
  kind: 'weapon',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'martial',
  group: 'axe',
  damage: { diceNumber: 1, dieFaces: 12, damageType: 'slashing' },
  hands: 2,
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
    }),
    'skill:arcana': buildSkill({
      skill: 'arcana',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'untrained',
      level: LEVEL,
    }),
    'strike:greataxe': buildStrikeAttack({
      weapon: WEAPON,
      attackAttribute: 'str',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
      attackNumber: 1,
    }),
  };
}

describeGolden(
  {
    name: 'Barbarian (level 1)',
    statistics: {
      // 10 (base) + 1 (dex, uncapped -- this armor's dexCap is 2) + 3 (trained at level 1) + 4 (armor) = 18
      ac: { total: 18 },
      // 3 (con) + 5 (expert at level 1) = 8
      fortitude: { total: 8 },
      // 1 (dex) + 3 (trained at level 1) = 4
      reflex: { total: 4 },
      // 0 (wis) + 5 (expert at level 1) = 5
      will: { total: 5 },
      // 0 (wis) + 5 (expert at level 1) = 5
      perception: { total: 5 },
      // 10 (base) + 4 (str, the Barbarian's key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (str) + 3 (trained at level 1) = 7
      'skill:athletics': { total: 7 },
      // 0 (int) + 0 (untrained) = 0
      'skill:arcana': { total: 0 },
      // 4 (str) + 3 (trained at level 1) = 7, no Multiple Attack Penalty on the first attack
      'strike:greataxe': { total: 7 },
    },
  },
  buildStatistics,
);
