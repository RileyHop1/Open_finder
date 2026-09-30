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
 * The scaling sweep (E.9 in the milestone plan): the same golden Rogue
 * from `rogue.test.ts`, at levels 5, 11, and 17. Per-level proficiency
 * ranks are confirmed against Archives of Nethys' Rogue class page, not
 * guessed: Perception Master at 7, **Legendary at 13**; Reflex Master at
 * 7, **Legendary at 13** -- the only class in this golden set to reach
 * legendary in anything by level 17; Fortitude Expert at 9; weapons Expert
 * at 7, Master at 13; Class DC Expert at 11, Master at 19 (not reached in
 * this sweep); light armor and unarmored defense Expert at 13; Will Master
 * at 17 (exactly the top of this sweep's range). Ability scores and
 * equipment are held constant across all three levels, to isolate
 * proficiency scaling from ability boosts gained at higher levels.
 */
const ABILITY_MODIFIERS = {
  str: attributeModifier(10),
  dex: attributeModifier(18),
  con: attributeModifier(12),
  int: attributeModifier(10),
  wis: attributeModifier(12),
  cha: attributeModifier(14),
};

const IMPORTED_AT = '2026-09-30T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: '10000000-0005-5000-8000-000000000014',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-rogues-leathers',
  name: "Invented Rogue's Leathers",
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
  id: '10000000-0006-5000-8000-000000000015',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-rogues-dagger',
  name: "Invented Rogue's Dagger",
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
    fortitude: 'trained',
    reflex: 'expert',
    will: 'expert',
    weapon: 'trained',
    armor: 'trained',
    classDc: 'trained',
  },
  {
    level: 11,
    perception: 'master',
    fortitude: 'expert',
    reflex: 'master',
    will: 'expert',
    weapon: 'expert',
    armor: 'trained',
    classDc: 'expert',
  },
  {
    level: 17,
    perception: 'legendary',
    fortitude: 'expert',
    reflex: 'legendary',
    will: 'master',
    weapon: 'master',
    armor: 'expert',
    classDc: 'expert',
  },
];

// Hand-computed at each level from the ranks above; see this file's own
// comment at each level for the arithmetic.
const EXPECTED_TOTALS: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  // level 5: base 10 + dex 4 (uncapped -- this armor's dexCap is 5) + trained-at-5 (7) + armor 3 = 24
  5: {
    ac: 24,
    fortitude: 8,
    reflex: 13,
    will: 10,
    perception: 10,
    classDc: 21,
    strike: 11,
  },
  // level 11: base 10 + dex 4 + trained-at-11 (13) + armor 3 = 30
  11: {
    ac: 30,
    fortitude: 16,
    reflex: 21,
    will: 16,
    perception: 18,
    classDc: 29,
    strike: 19,
  },
  // level 17: base 10 + dex 4 + expert-at-17 (21) + armor 3 = 38
  17: {
    ac: 38,
    fortitude: 22,
    reflex: 29,
    will: 24,
    perception: 26,
    classDc: 35,
    strike: 27,
  },
};

for (const ranks of LEVELS) {
  const expected = EXPECTED_TOTALS[ranks.level]!;

  describeGolden(
    {
      name: `Rogue (level ${ranks.level})`,
      statistics: {
        ac: { total: expected.ac! },
        fortitude: { total: expected.fortitude! },
        reflex: { total: expected.reflex! },
        will: { total: expected.will! },
        perception: { total: expected.perception! },
        classDc: { total: expected.classDc! },
        'strike:dagger': { total: expected.strike! },
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
        keyAttribute: 'dex',
        attributeModifiers: ABILITY_MODIFIERS,
        proficiencyRank: ranks.classDc,
        level: ranks.level,
      }),
      'strike:dagger': buildStrikeAttack({
        weapon: WEAPON,
        attackAttribute: 'dex',
        attributeModifiers: ABILITY_MODIFIERS,
        proficiencyRank: ranks.weapon,
        level: ranks.level,
        attackNumber: 1,
      }),
    }),
  );
}
