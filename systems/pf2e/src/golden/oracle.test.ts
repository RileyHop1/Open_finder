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
 * A level 1 Oracle, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys'
 * Oracle class page (Player Core): Perception Trained; Fortitude Trained,
 * Reflex Trained, Will Expert; unarmed/simple weapons Trained (no
 * martial); light armor and unarmored defense Trained (no medium/heavy);
 * Class DC Trained. Key ability: Charisma.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 10, dex: 12, con: 14, int: 10, wis: 10, cha: 18 } as const;

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
  id: 'ffffffff-0000-5111-8222-000000000004',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-oracles-vestments',
  name: "Invented Oracle's Vestments",
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
  id: '00000001-1111-5222-8333-000000000005',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-oracles-mace',
  name: "Invented Oracle's Mace",
  kind: 'weapon',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'simple',
  group: 'club',
  damage: { diceNumber: 1, dieFaces: 6, damageType: 'bludgeoning' },
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
    'skill:religion': buildSkill({
      skill: 'religion',
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
    'strike:mace': buildStrikeAttack({
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
    name: 'Oracle (level 1)',
    statistics: {
      // 10 (base) + 1 (dex, uncapped -- this armor's dexCap is 4) + 3 (trained at level 1) + 3 (armor) = 17
      ac: { total: 17 },
      // 2 (con) + 3 (trained at level 1) = 5
      fortitude: { total: 5 },
      // 1 (dex) + 3 (trained at level 1) = 4
      reflex: { total: 4 },
      // 0 (wis) + 5 (expert at level 1) = 5
      will: { total: 5 },
      // 0 (wis) + 3 (trained at level 1) = 3
      perception: { total: 3 },
      // 10 (base) + 4 (cha, the Oracle's key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // Religion is Wisdom-based, not Charisma-based -- 0 (wis) + 3 (trained at level 1) = 3
      'skill:religion': { total: 3 },
      // 0 (int) + 0 (untrained) = 0
      'skill:arcana': { total: 0 },
      // 0 (str) + 3 (trained at level 1) = 3, no Multiple Attack Penalty on the first attack
      'strike:mace': { total: 3 },
    },
  },
  buildStatistics,
);
