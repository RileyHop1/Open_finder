import type { ArmorEntry, WeaponEntry } from '../index.js';
import { prepareCharacter } from '../index.js';
import { describeGolden } from './describeGolden.js';
import { goldenCharacter, goldenStatistics } from './goldenCharacter.js';

/**
 * A level 1 Rogue, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys'
 * Rogue class page (Player Core; the Remaster simplified the Rogue's
 * weapon list to plain simple/martial proficiency, replacing the earlier
 * "rapier, sap, shortbow, shortsword, plus racket weapon" list): Perception
 * Expert; Fortitude Trained, Reflex Expert, Will Expert;
 * unarmed/simple/martial weapons Trained; light armor and unarmored
 * defense Trained (no medium/heavy); Class DC Trained. Key ability:
 * Dexterity (or an option from the rogue's racket) -- this fixture picks
 * Dexterity.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 10, dex: 18, con: 12, int: 10, wis: 12, cha: 14 } as const;

const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: 'eeeeeeee-eeee-5eee-8eee-eeeeeeeeeeee',
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
  id: 'ffffffff-ffff-5fff-8fff-ffffffffffff',
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

// A finesse dagger's attack uses Dexterity, since it beats this build's Strength.
function buildStatistics() {
  return goldenStatistics(
    prepareCharacter(
      goldenCharacter({
        level: LEVEL,
        scores: ABILITY_SCORES,
        keyAttribute: 'dex',
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
        skills: { stealth: 'trained' },
      }),
    ),
    'dagger',
  );
}

describeGolden(
  {
    name: 'Rogue (level 1)',
    statistics: {
      // 10 (base) + 4 (dex, uncapped -- this armor's dexCap is 5) + 3 (trained at level 1) + 3 (armor) = 20
      ac: { total: 20 },
      // 1 (con) + 3 (trained at level 1) = 4
      fortitude: { total: 4 },
      // 4 (dex) + 5 (expert at level 1) = 9
      reflex: { total: 9 },
      // 1 (wis) + 5 (expert at level 1) = 6
      will: { total: 6 },
      // 1 (wis) + 5 (expert at level 1) = 6
      perception: { total: 6 },
      // 10 (base) + 4 (dex, the chosen key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (dex) + 3 (trained at level 1) = 7
      'skill:stealth': { total: 7 },
      // 0 (str) + 0 (untrained) = 0
      'skill:athletics': { total: 0 },
      // 4 (dex) + 3 (trained at level 1) = 7, no Multiple Attack Penalty on the first attack
      'strike:dagger': { total: 7 },
    },
  },
  buildStatistics,
);
