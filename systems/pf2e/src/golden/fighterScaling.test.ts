import type { ArmorEntry, ProficiencyRank, WeaponEntry } from '../index.js';
import {
  attributeModifier,
  buildArmorClass,
  buildClassDc,
  buildPerception,
  buildSave,
  buildStrikeAttack,
} from '../index.js';
import { describeGolden } from './describeGolden.js';

/**
 * The scaling sweep (E.9 in the milestone plan): the same golden Fighter
 * from `fighter.test.ts`, at levels 5, 11, and 17, to catch a broken
 * proficiency-rank *step* -- a bug that only shows up once a rank actually
 * changes, which a level 1-only fixture can never exercise. Per-level
 * proficiency ranks are confirmed against Archives of Nethys' Fighter
 * class page, not guessed: Perception Master at 7; Fortitude Master at 9;
 * Reflex Master at 15; Will Expert at 3 (no further increase); weapons
 * Master at 13; all armor Expert at 11, Master at 17; Class DC Expert at
 * 11. Ability scores and equipment are held constant across all three
 * levels on purpose, to isolate proficiency scaling from the separate
 * (and, per `attributes.ts`, out-of-scope-for-Stack-D) question of ability
 * boosts gained at higher levels.
 */
const ABILITY_MODIFIERS = {
  str: attributeModifier(18),
  dex: attributeModifier(14),
  con: attributeModifier(14),
  int: attributeModifier(10),
  wis: attributeModifier(12),
  cha: attributeModifier(10),
};

const IMPORTED_AT = '2026-09-30T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: '10000000-0001-5000-8000-000000000010',
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
  id: '10000000-0002-5000-8000-000000000011',
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

interface LevelRanks {
  readonly level: number;
  readonly perception: ProficiencyRank;
  readonly fortitude: ProficiencyRank;
  readonly reflex: ProficiencyRank;
  readonly will: ProficiencyRank;
  readonly weapon: ProficiencyRank;
  readonly armor: ProficiencyRank;
  readonly classDc: ProficiencyRank;
}

const LEVELS: readonly LevelRanks[] = [
  {
    level: 5,
    perception: 'expert',
    fortitude: 'expert',
    reflex: 'expert',
    will: 'expert',
    weapon: 'expert',
    armor: 'trained',
    classDc: 'trained',
  },
  {
    level: 11,
    perception: 'master',
    fortitude: 'master',
    reflex: 'expert',
    will: 'expert',
    weapon: 'expert',
    armor: 'expert',
    classDc: 'expert',
  },
  {
    level: 17,
    perception: 'master',
    fortitude: 'master',
    reflex: 'master',
    will: 'expert',
    weapon: 'master',
    armor: 'master',
    classDc: 'expert',
  },
];

// Hand-computed at each level from the ranks above; see this file's own
// comment at each level for the arithmetic.
const EXPECTED_TOTALS: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  // level 5: base 10 + dex 1 (capped from +2 by this armor's dexCap of 1) + trained-at-5 (7) + armor 4 = 22
  5: {
    ac: 22,
    fortitude: 11,
    reflex: 11,
    will: 10,
    perception: 10,
    classDc: 21,
    strike: 13,
  },
  // level 11: base 10 + dex 1 + expert-at-11 (15) + armor 4 = 30
  11: {
    ac: 30,
    fortitude: 19,
    reflex: 17,
    will: 16,
    perception: 18,
    classDc: 29,
    strike: 19,
  },
  // level 17: base 10 + dex 1 + master-at-17 (23) + armor 4 = 38
  17: {
    ac: 38,
    fortitude: 25,
    reflex: 25,
    will: 22,
    perception: 24,
    classDc: 35,
    strike: 27,
  },
};

for (const ranks of LEVELS) {
  const expected = EXPECTED_TOTALS[ranks.level]!;

  describeGolden(
    {
      name: `Fighter (level ${ranks.level})`,
      statistics: {
        ac: { total: expected.ac! },
        fortitude: { total: expected.fortitude! },
        reflex: { total: expected.reflex! },
        will: { total: expected.will! },
        perception: { total: expected.perception! },
        classDc: { total: expected.classDc! },
        'strike:longsword': { total: expected.strike! },
      },
    },
    () => ({
      ac: buildArmorClass({
        attributeModifiers: ABILITY_MODIFIERS,
        armor: ARMOR,
        proficiencyRank: ranks.armor,
        level: ranks.level,
      }),
      fortitude: buildSave({
        save: 'fortitude',
        attributeModifiers: ABILITY_MODIFIERS,
        proficiencyRank: ranks.fortitude,
        level: ranks.level,
      }),
      reflex: buildSave({
        save: 'reflex',
        attributeModifiers: ABILITY_MODIFIERS,
        proficiencyRank: ranks.reflex,
        level: ranks.level,
      }),
      will: buildSave({
        save: 'will',
        attributeModifiers: ABILITY_MODIFIERS,
        proficiencyRank: ranks.will,
        level: ranks.level,
      }),
      perception: buildPerception({
        attributeModifiers: ABILITY_MODIFIERS,
        proficiencyRank: ranks.perception,
        level: ranks.level,
      }),
      classDc: buildClassDc({
        keyAttribute: 'str',
        attributeModifiers: ABILITY_MODIFIERS,
        proficiencyRank: ranks.classDc,
        level: ranks.level,
      }),
      'strike:longsword': buildStrikeAttack({
        weapon: WEAPON,
        attackAttribute: 'str',
        attributeModifiers: ABILITY_MODIFIERS,
        proficiencyRank: ranks.weapon,
        level: ranks.level,
        attackNumber: 1,
      }),
    }),
  );
}
