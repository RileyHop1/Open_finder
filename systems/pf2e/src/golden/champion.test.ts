import type { ArmorEntry, WeaponEntry } from '../index.js';
import { prepareCharacter } from '../index.js';
import { describeGolden } from './describeGolden.js';
import { goldenCharacter, goldenStatistics } from './goldenCharacter.js';

/**
 * A level 1 Champion, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys'
 * Champion class page (Player Core): Perception Trained; Fortitude
 * Expert, Reflex Trained, Will Expert; unarmed/simple/martial weapons
 * Trained; all armor (light/medium/heavy) and unarmored defense Trained;
 * Class DC Trained. Key ability: Strength or Dexterity, player's choice --
 * this fixture picks Strength, for a heavy-armor build.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 18, dex: 12, con: 14, int: 10, wis: 12, cha: 14 } as const;

const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: '99999999-aaaa-5bbb-8ccc-dddddddddddd',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-champions-plate',
  name: "Invented Champion's Plate",
  kind: 'armor',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'heavy',
  acBonus: 6,
  dexCap: 0,
  checkPenalty: -3,
  speedPenalty: -5,
};

const WEAPON: WeaponEntry = {
  id: 'aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-champions-longsword',
  name: "Invented Champion's Longsword",
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

function buildStatistics() {
  return goldenStatistics(
    prepareCharacter(
      goldenCharacter({
        level: LEVEL,
        scores: ABILITY_SCORES,
        keyAttribute: 'str',
        ranks: {
          perception: 'trained',
          fortitude: 'expert',
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
    'longsword',
  );
}

describeGolden(
  {
    name: 'Champion (level 1)',
    statistics: {
      // 10 (base) + 0 (dex, capped from +1 by this heavy armor's dexCap of 0) + 3 (trained at level 1) + 6 (armor) = 19
      ac: { total: 19 },
      // 2 (con) + 5 (expert at level 1) = 7
      fortitude: { total: 7 },
      // 1 (dex) + 3 (trained at level 1) = 4
      reflex: { total: 4 },
      // 1 (wis) + 5 (expert at level 1) = 6
      will: { total: 6 },
      // 1 (wis) + 3 (trained at level 1) = 4
      perception: { total: 4 },
      // 10 (base) + 4 (str, the chosen key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 1 (wis) + 3 (trained at level 1) = 4
      'skill:religion': { total: 4 },
      // 0 (int) + 0 (untrained) = 0
      'skill:arcana': { total: 0 },
      // 4 (str) + 3 (trained at level 1) = 7, no Multiple Attack Penalty on the first attack
      'strike:longsword': { total: 7 },
    },
  },
  buildStatistics,
);
