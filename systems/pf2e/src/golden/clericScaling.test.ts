import type { ArmorEntry, ProficiencyRank, WeaponEntry } from '../index.js';
import { prepareCharacter } from '../index.js';
import { describeGolden } from './describeGolden.js';
import { goldenCharacter, goldenStatistics } from './goldenCharacter.js';

/**
 * The scaling sweep (E.9 in the milestone plan): the same golden Cleric
 * from `cleric.test.ts`, at levels 5, 11, and 17. Per-level proficiency
 * ranks are confirmed against Archives of Nethys' Cleric class page, not
 * guessed: Perception Expert at 5 (never advances further); Will Master at
 * 9; Reflex Expert at 11. **Fortitude and Class DC never advance past
 * Trained at all** for an undifferentiated Cleric -- a real, notable
 * property of the class (it's a large part of why the Warpriest doctrine,
 * which does improve Fortitude, is a popular pick), and exactly the kind
 * of flat-rank case this sweep should cover alongside the classes that do
 * advance: even at a fixed rank, `proficiencyModifier`'s total still grows
 * with level, from the level term alone. Spellcasting proficiency (spell
 * attack/DC) is not modeled here -- Stack D has no builder for it, since
 * full spellcasting is milestone 8's job; a caster's Class DC (asserted
 * below) and their spell DC are mechanically distinct statistics with
 * their own, different proficiency progressions. Ability scores and
 * equipment are held constant across all three levels, to isolate
 * proficiency scaling from ability boosts gained at higher levels.
 */
const SCORES = {
  str: 10,
  dex: 12,
  con: 14,
  int: 10,
  wis: 18,
  cha: 10,
};

const IMPORTED_AT = '2026-09-30T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

/** No armor proficiency at any of these levels -- this represents the Cleric's unarmored defense, with no item bonus of its own. */
const ARMOR: ArmorEntry = {
  id: '10000000-0003-5000-8000-000000000012',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-unarmored-clothing',
  name: 'Invented Unarmored Clothing',
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
  id: '10000000-0004-5000-8000-000000000013',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-clerics-mace',
  name: "Invented Cleric's Mace",
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
    reflex: 'trained',
    will: 'expert',
    weapon: 'trained',
    armor: 'trained',
    classDc: 'trained',
  },
  {
    level: 11,
    perception: 'expert',
    fortitude: 'trained',
    reflex: 'expert',
    will: 'master',
    weapon: 'trained',
    armor: 'trained',
    classDc: 'trained',
  },
  {
    level: 17,
    perception: 'expert',
    fortitude: 'trained',
    reflex: 'expert',
    will: 'master',
    weapon: 'trained',
    armor: 'trained',
    classDc: 'trained',
  },
];

// Hand-computed at each level from the ranks above; see this file's own
// comment at each level for the arithmetic.
const EXPECTED_TOTALS: Readonly<Record<number, Readonly<Record<string, number>>>> = {
  // level 5: base 10 + dex 1 (uncapped, no armor at all) + trained-at-5 (7) + 0 (no armor item bonus) = 18
  5: {
    ac: 18,
    fortitude: 9,
    reflex: 8,
    will: 13,
    perception: 13,
    classDc: 21,
    strike: 7,
  },
  // level 11: base 10 + dex 1 + trained-at-11 (13) + 0 = 24
  11: {
    ac: 24,
    fortitude: 15,
    reflex: 16,
    will: 21,
    perception: 19,
    classDc: 27,
    strike: 13,
  },
  // level 17: base 10 + dex 1 + trained-at-17 (19) + 0 = 30
  17: {
    ac: 30,
    fortitude: 21,
    reflex: 22,
    will: 27,
    perception: 25,
    classDc: 33,
    strike: 19,
  },
};

for (const ranks of LEVELS) {
  const expected = EXPECTED_TOTALS[ranks.level]!;

  describeGolden(
    {
      name: `Cleric (level ${ranks.level})`,
      statistics: {
        ac: { total: expected.ac! },
        fortitude: { total: expected.fortitude! },
        reflex: { total: expected.reflex! },
        will: { total: expected.will! },
        perception: { total: expected.perception! },
        classDc: { total: expected.classDc! },
        'strike:mace': { total: expected.strike! },
      },
    },
    () =>
      goldenStatistics(
        prepareCharacter(
          goldenCharacter({
            level: ranks.level,
            scores: SCORES,
            keyAttribute: 'wis',
            ranks: {
              perception: ranks.perception,
              fortitude: ranks.fortitude,
              reflex: ranks.reflex,
              will: ranks.will,
              classDc: ranks.classDc,
              armor: ranks.armor,
              weapon: ranks.weapon,
            },
            armor: ARMOR,
            weapon: WEAPON,
          }),
        ),
        'mace',
      ),
  );
}
