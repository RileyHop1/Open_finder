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
 * A level 1 Swashbuckler, built by hand -- never a published stat block
 * (ADR 0013). Initial proficiencies confirmed against Archives of Nethys'
 * Swashbuckler class page (Player Core 2): Perception Expert; Fortitude
 * Trained, Reflex Expert, Will Expert; unarmed/simple/martial weapons
 * Trained; light armor and unarmored defense Trained (no medium/heavy);
 * Class DC Trained. Key ability: Dexterity -- the only martial class in
 * this golden set with a fixed key ability rather than a choice.
 *
 * This is the sixteenth and final class, completing one golden fixture
 * per class per CLAUDE.md's Testing section.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 10, dex: 18, con: 14, int: 10, wis: 12, cha: 14 } as const;

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
  id: '00000004-4444-5555-8666-000000000008',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-swashbucklers-leathers',
  name: "Invented Swashbuckler's Leathers",
  kind: 'armor',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'light',
  acBonus: 3,
  dexCap: 5,
  checkPenalty: 0,
  speedPenalty: 0,
};

const WEAPON: WeaponEntry = {
  id: '00000005-5555-5666-8777-000000000009',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-swashbucklers-rapier',
  name: "Invented Swashbuckler's Rapier",
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
      proficiencyRank: 'expert',
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
    // A finesse rapier's attack uses Dexterity, which is also this build's key ability.
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
    name: 'Swashbuckler (level 1)',
    statistics: {
      // 10 (base) + 4 (dex, uncapped -- this armor's dexCap is 5) + 3 (trained at level 1) + 3 (armor) = 20
      ac: { total: 20 },
      // 2 (con) + 3 (trained at level 1) = 5
      fortitude: { total: 5 },
      // 4 (dex) + 5 (expert at level 1) = 9
      reflex: { total: 9 },
      // 1 (wis) + 5 (expert at level 1) = 6
      will: { total: 6 },
      // 1 (wis) + 5 (expert at level 1) = 6
      perception: { total: 6 },
      // 10 (base) + 4 (dex, the Swashbuckler's key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (dex) + 3 (trained at level 1) = 7
      'skill:acrobatics': { total: 7 },
      // 0 (int) + 0 (untrained) = 0
      'skill:arcana': { total: 0 },
      // 4 (dex) + 3 (trained at level 1) = 7, no Multiple Attack Penalty on the first attack
      'strike:rapier': { total: 7 },
    },
  },
  buildStatistics,
);
