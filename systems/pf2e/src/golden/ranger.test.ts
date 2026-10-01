import type { ArmorEntry, WeaponEntry } from '../index.js';
import { prepareCharacter } from '../index.js';
import { describeGolden } from './describeGolden.js';
import { goldenCharacter, goldenStatistics } from './goldenCharacter.js';

/**
 * A level 1 Ranger, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys'
 * Ranger class page (Player Core): Perception Expert; Fortitude Expert,
 * Reflex Expert, Will Trained; unarmed/simple/martial weapons Trained;
 * Class DC Trained; light and medium armor Trained (no heavy). Key
 * ability: Strength or Dexterity, player's choice -- this fixture picks
 * Dexterity, for a ranged build.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 12, dex: 18, con: 14, int: 10, wis: 12, cha: 10 } as const;

const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: 'cccccccc-cccc-5ccc-8ccc-cccccccccccc',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-rangers-leathers',
  name: "Invented Ranger's Leathers",
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
  id: 'dddddddd-dddd-5ddd-8ddd-dddddddddddd',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-rangers-shortbow',
  name: "Invented Ranger's Shortbow",
  kind: 'weapon',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'martial',
  group: 'bow',
  damage: { diceNumber: 1, dieFaces: 6, damageType: 'piercing' },
  hands: 2,
  range: 60,
};

// A shortbow's attack uses Dexterity -- always true for a ranged weapon, not a finesse choice.
function buildStatistics() {
  return goldenStatistics(
    prepareCharacter(
      goldenCharacter({
        level: LEVEL,
        scores: ABILITY_SCORES,
        keyAttribute: 'dex',
        ranks: {
          perception: 'expert',
          fortitude: 'expert',
          reflex: 'expert',
          will: 'trained',
          classDc: 'trained',
          armor: 'trained',
          weapon: 'trained',
        },
        armor: ARMOR,
        weapon: WEAPON,
        skills: { survival: 'trained' },
      }),
    ),
    'shortbow',
  );
}

describeGolden(
  {
    name: 'Ranger (level 1)',
    statistics: {
      // 10 (base) + 4 (dex, uncapped -- equal to this armor's dexCap of 4) + 3 (trained at level 1) + 3 (armor) = 20
      ac: { total: 20 },
      // 2 (con) + 5 (expert at level 1) = 7
      fortitude: { total: 7 },
      // 4 (dex) + 5 (expert at level 1) = 9
      reflex: { total: 9 },
      // 1 (wis) + 3 (trained at level 1) = 4
      will: { total: 4 },
      // 1 (wis) + 5 (expert at level 1) = 6
      perception: { total: 6 },
      // 10 (base) + 4 (dex, the chosen key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 1 (wis) + 3 (trained at level 1) = 4
      'skill:survival': { total: 4 },
      // 4 (dex) + 0 (untrained) = 4
      'skill:thievery': { total: 4 },
      // 4 (dex) + 3 (trained at level 1) = 7, no Multiple Attack Penalty on the first attack
      'strike:shortbow': { total: 7 },
    },
  },
  buildStatistics,
);
