import type { ArmorEntry, WeaponEntry } from '../index.js';
import { prepareCharacter } from '../index.js';
import { describeGolden } from './describeGolden.js';
import { goldenCharacter, goldenStatistics } from './goldenCharacter.js';

/**
 * A level 1 Investigator, built by hand -- never a published stat block
 * (ADR 0013). Initial proficiencies confirmed against Archives of Nethys'
 * Investigator class page (Player Core 2): Perception Expert; Fortitude
 * Trained, Reflex Expert, Will Expert; unarmed/simple/martial weapons
 * Trained; light armor and unarmored defense Trained (no medium/heavy);
 * Class DC Trained. Key ability: Intelligence.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 10, dex: 16, con: 12, int: 18, wis: 10, cha: 10 } as const;

const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core 2',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: 'bbbbbbbb-cccc-5ddd-8eee-ffffffffffff',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-investigators-leathers',
  name: "Invented Investigator's Leathers",
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
  id: 'cccccccc-dddd-5eee-8fff-000000000001',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-investigators-dagger',
  name: "Invented Investigator's Dagger",
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

// A finesse dagger's attack uses Dexterity, since it beats this build's Strength.
function buildStatistics() {
  return goldenStatistics(
    prepareCharacter(
      goldenCharacter({
        level: LEVEL,
        scores: ABILITY_SCORES,
        keyAttribute: 'int',
        ranks: {
          perception: 'expert',
          fortitude: 'trained',
          reflex: 'expert',
          will: 'expert',
          classDc: 'trained',
          armor: 'trained',
          weapon: 'trained',
        },
        armor: ARMOR,
        weapon: WEAPON,
        skills: { society: 'trained' },
      }),
    ),
    'dagger',
  );
}

describeGolden(
  {
    name: 'Investigator (level 1)',
    statistics: {
      // 10 (base) + 3 (dex, uncapped -- this armor's dexCap is 4) + 3 (trained at level 1) + 3 (armor) = 19
      ac: { total: 19 },
      // 1 (con) + 3 (trained at level 1) = 4
      fortitude: { total: 4 },
      // 3 (dex) + 5 (expert at level 1) = 8
      reflex: { total: 8 },
      // 0 (wis) + 5 (expert at level 1) = 5
      will: { total: 5 },
      // 0 (wis) + 5 (expert at level 1) = 5
      perception: { total: 5 },
      // 10 (base) + 4 (int, the Investigator's key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (int) + 3 (trained at level 1) = 7
      'skill:society': { total: 7 },
      // 0 (str) + 0 (untrained) = 0
      'skill:athletics': { total: 0 },
      // 3 (dex) + 3 (trained at level 1) = 6, no Multiple Attack Penalty on the first attack
      'strike:dagger': { total: 6 },
    },
  },
  buildStatistics,
);
