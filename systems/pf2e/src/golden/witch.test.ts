import type { ArmorEntry, WeaponEntry } from '../index.js';
import { prepareCharacter } from '../index.js';
import { describeGolden } from './describeGolden.js';
import { goldenCharacter, goldenStatistics } from './goldenCharacter.js';

/**
 * A level 1 Witch, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys' Witch
 * class page (Player Core): Perception Trained; Fortitude Trained, Reflex
 * Trained, Will Expert; unarmed/simple weapons Trained (no martial);
 * unarmored defense Trained only (no light/medium/heavy); Class DC
 * Trained. Key ability: Intelligence.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 10, dex: 14, con: 12, int: 18, wis: 10, cha: 10 } as const;

const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

/** No armor proficiency at level 1 -- this represents the Witch's unarmored defense, with no item bonus of its own. */
const ARMOR: ArmorEntry = {
  id: '11111111-2222-5333-8444-555555555555',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-unarmored-robes',
  name: 'Invented Unarmored Robes',
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
  id: '22222222-3333-5444-8555-666666666666',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-witchs-knife',
  name: "Invented Witch's Knife",
  kind: 'weapon',
  provenance: PROVENANCE,
  traits: ['finesse'],
  ruleElements: [],
  description: '',
  category: 'simple',
  group: 'knife',
  damage: { diceNumber: 1, dieFaces: 4, damageType: 'slashing' },
  hands: 1,
};

// A finesse knife's attack uses Dexterity, since it beats this build's Strength.
function buildStatistics() {
  return goldenStatistics(
    prepareCharacter(
      goldenCharacter({
        level: LEVEL,
        scores: ABILITY_SCORES,
        keyAttribute: 'int',
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
        skills: { occultism: 'trained' },
      }),
    ),
    'knife',
  );
}

describeGolden(
  {
    name: 'Witch (level 1)',
    statistics: {
      // 10 (base) + 2 (dex, uncapped -- no armor at all) + 3 (trained at level 1) + 0 (no armor item bonus) = 15
      ac: { total: 15 },
      // 1 (con) + 3 (trained at level 1) = 4
      fortitude: { total: 4 },
      // 2 (dex) + 3 (trained at level 1) = 5
      reflex: { total: 5 },
      // 0 (wis) + 5 (expert at level 1) = 5
      will: { total: 5 },
      // 0 (wis) + 3 (trained at level 1) = 3
      perception: { total: 3 },
      // 10 (base) + 4 (int, the Witch's key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (int) + 3 (trained at level 1) = 7
      'skill:occultism': { total: 7 },
      // 0 (cha) + 0 (untrained) = 0
      'skill:diplomacy': { total: 0 },
      // 2 (dex) + 3 (trained at level 1) = 5, no Multiple Attack Penalty on the first attack
      'strike:knife': { total: 5 },
    },
  },
  buildStatistics,
);
