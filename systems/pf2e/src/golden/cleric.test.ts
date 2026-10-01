import type { ArmorEntry, WeaponEntry } from '../index.js';
import { prepareCharacter } from '../index.js';
import { describeGolden } from './describeGolden.js';
import { goldenCharacter, goldenStatistics } from './goldenCharacter.js';

/**
 * A level 1 Cleric, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys'
 * Cleric class page (Player Core): Perception Trained; Fortitude Trained,
 * Reflex Trained, Will Expert; unarmed/simple weapons Trained (no martial);
 * Class DC Trained; unarmored defense Trained (no light/medium/heavy).
 * Key ability: Wisdom.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 10, dex: 12, con: 14, int: 10, wis: 18, cha: 10 } as const;

const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

/** No metal armor proficiency at level 1 -- this represents the Cleric's unarmored defense, with no item bonus of its own. */
const ARMOR: ArmorEntry = {
  id: '88888888-8888-5888-8888-888888888888',
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
  id: '99999999-9999-5999-8999-999999999999',
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

function buildStatistics() {
  return goldenStatistics(
    prepareCharacter(
      goldenCharacter({
        level: LEVEL,
        scores: ABILITY_SCORES,
        keyAttribute: 'wis',
        ranks: {
          perception: 'trained',
          fortitude: 'trained',
          reflex: 'trained',
          will: 'expert',
          classDc: 'trained',
          armor: 'trained',
          weapon: 'trained',
        },
        armor: ARMOR,
        weapon: WEAPON,
        skills: { religion: 'trained' },
      }),
    ),
    'mace',
  );
}

describeGolden(
  {
    name: 'Cleric (level 1)',
    statistics: {
      // 10 (base) + 1 (dex) + 3 (trained at level 1) + 0 (no armor item bonus) = 14
      ac: { total: 14 },
      // 2 (con) + 3 (trained at level 1) = 5
      fortitude: { total: 5 },
      // 1 (dex) + 3 (trained at level 1) = 4
      reflex: { total: 4 },
      // 4 (wis) + 5 (expert at level 1) = 9
      will: { total: 9 },
      // 4 (wis) + 3 (trained at level 1) = 7
      perception: { total: 7 },
      // 10 (base) + 4 (wis, the Cleric's key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (wis) + 3 (trained at level 1) = 7
      'skill:religion': { total: 7 },
      // 0 (int) + 0 (untrained) = 0
      'skill:arcana': { total: 0 },
      // 0 (str) + 3 (trained at level 1) = 3, no Multiple Attack Penalty on the first attack
      'strike:mace': { total: 3 },
    },
  },
  buildStatistics,
);
