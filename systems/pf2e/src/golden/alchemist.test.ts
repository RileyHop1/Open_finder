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
 * A level 1 Alchemist, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys'
 * Alchemist class page (Player Core 2): Perception Trained; Fortitude
 * Expert, Reflex Expert, Will Trained; unarmed/simple weapons and
 * alchemical bombs Trained (no martial); light and medium armor Trained
 * (no heavy); Class DC Trained. Key ability: Intelligence. Alchemical
 * bombs have no equivalent in `WeaponEntry` yet (they are consumable
 * items, not a weapon type Stack B modeled) -- this fixture's strike uses
 * a simple weapon instead, the same as every other non-bomb attack.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 10, dex: 16, con: 14, int: 18, wis: 10, cha: 10 } as const;

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
  id: '55555555-6666-5777-8888-999999999999',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-alchemists-leathers',
  name: "Invented Alchemist's Leathers",
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
  id: '66666666-7777-5888-8999-aaaaaaaaaaaa',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-alchemists-dagger',
  name: "Invented Alchemist's Dagger",
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
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    classDc: buildClassDc({
      keyAttribute: 'int',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    'skill:crafting': buildSkill({
      skill: 'crafting',
      attributeModifiers: ATTRIBUTE_MODIFIERS,
      proficiencyRank: 'trained',
      level: LEVEL,
    }),
    'skill:diplomacy': buildSkill({
      skill: 'diplomacy',
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
    name: 'Alchemist (level 1)',
    statistics: {
      // 10 (base) + 3 (dex, uncapped -- this armor's dexCap is 4) + 3 (trained at level 1) + 3 (armor) = 19
      ac: { total: 19 },
      // 2 (con) + 5 (expert at level 1) = 7
      fortitude: { total: 7 },
      // 3 (dex) + 5 (expert at level 1) = 8
      reflex: { total: 8 },
      // 0 (wis) + 3 (trained at level 1) = 3
      will: { total: 3 },
      // 0 (wis) + 3 (trained at level 1) = 3
      perception: { total: 3 },
      // 10 (base) + 4 (int, the Alchemist's key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (int) + 3 (trained at level 1) = 7
      'skill:crafting': { total: 7 },
      // 0 (cha) + 0 (untrained) = 0
      'skill:diplomacy': { total: 0 },
      // 3 (dex) + 3 (trained at level 1) = 6, no Multiple Attack Penalty on the first attack
      'strike:dagger': { total: 6 },
    },
  },
  buildStatistics,
);
