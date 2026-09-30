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
 * A level 1 Monk, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys' Monk
 * class page (Player Core 2): Perception Trained; Fortitude, Reflex, and
 * Will all Expert -- the only class in this golden set with all three
 * saves starting Expert; unarmed/simple weapons Trained (no martial); no
 * armor proficiency at all, but unarmored defense **Expert**, unlike every
 * other class in this set's Trained unarmored defense; Class DC Trained.
 * Key ability: Strength or Dexterity, player's choice -- this fixture
 * picks Dexterity.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 12, dex: 18, con: 14, int: 10, wis: 14, cha: 10 } as const;

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

/** No armor at all -- this represents the Monk's unarmored defense, at Expert rather than every other class's Trained. */
const ARMOR: ArmorEntry = {
  id: 'dddddddd-eeee-5fff-8000-000000000002',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-monks-robes',
  name: "Invented Monk's Robes",
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

/** An unarmed strike, using `WeaponEntry`'s `'unarmed'` category and the `'brawling'` group real fists use. */
const WEAPON: WeaponEntry = {
  id: 'eeeeeeee-ffff-5000-8001-000000000003',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-monks-fist',
  name: "Invented Monk's Fist",
  kind: 'weapon',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'unarmed',
  group: 'brawling',
  damage: { diceNumber: 1, dieFaces: 4, damageType: 'bludgeoning' },
  hands: 1,
};

function buildStatistics() {
  return {
    ac: buildArmorClass({
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      armor: ARMOR,
      proficiencyRank: 'expert',
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
      proficiencyRank: 'expert',
      level: LEVEL,
    }),
    perception: buildPerception({
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    classDc: buildClassDc({
      keyAttribute: 'dex',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    'skill:acrobatics': buildSkill({
      skill: 'acrobatics',
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
    // Unarmed strikes use Strength by default; nothing here models the finesse-style class features some monk stances grant.
    'strike:fist': buildStrikeAttack({
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
    name: 'Monk (level 1)',
    statistics: {
      // 10 (base) + 4 (dex, uncapped -- no armor at all) + 5 (expert at level 1) + 0 (no armor item bonus) = 19
      ac: { total: 19 },
      // 2 (con) + 5 (expert at level 1) = 7
      fortitude: { total: 7 },
      // 4 (dex) + 5 (expert at level 1) = 9
      reflex: { total: 9 },
      // 2 (wis) + 5 (expert at level 1) = 7
      will: { total: 7 },
      // 2 (wis) + 3 (trained at level 1) = 5
      perception: { total: 5 },
      // 10 (base) + 4 (dex, the chosen key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (dex) + 3 (trained at level 1) = 7
      'skill:acrobatics': { total: 7 },
      // 0 (int) + 0 (untrained) = 0
      'skill:arcana': { total: 0 },
      // 1 (str) + 3 (trained at level 1) = 4, no Multiple Attack Penalty on the first attack
      'strike:fist': { total: 4 },
    },
  },
  buildStatistics,
);
