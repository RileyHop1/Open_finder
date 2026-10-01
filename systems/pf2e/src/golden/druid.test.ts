import type { ArmorEntry, WeaponEntry } from '../index.js';
import { prepareCharacter } from '../index.js';
import { describeGolden } from './describeGolden.js';
import { goldenCharacter, goldenStatistics } from './goldenCharacter.js';

/**
 * A level 1 Druid, built by hand -- never a published stat block (ADR
 * 0013). Initial proficiencies confirmed against Archives of Nethys' Druid
 * class page (Player Core): Perception Trained; Fortitude Trained, Reflex
 * Trained, Will Expert; unarmed/simple weapons Trained (no martial); Class
 * DC Trained; light and medium armor Trained (no heavy). Key ability:
 * Wisdom.
 */
const LEVEL = 1;

const ABILITY_SCORES = { str: 10, dex: 14, con: 12, int: 10, wis: 18, cha: 10 } as const;

const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: 'aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-druids-hide',
  name: "Invented Druid's Hide",
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
  id: 'bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-druids-staff',
  name: "Invented Druid's Staff",
  kind: 'weapon',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'simple',
  group: 'club',
  damage: { diceNumber: 1, dieFaces: 4, damageType: 'bludgeoning' },
  hands: 2,
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
        skills: { nature: 'trained' },
      }),
    ),
    'staff',
  );
}

describeGolden(
  {
    name: 'Druid (level 1)',
    statistics: {
      // 10 (base) + 2 (dex, uncapped -- this armor's dexCap is 4) + 3 (trained at level 1) + 3 (armor) = 18
      ac: { total: 18 },
      // 1 (con) + 3 (trained at level 1) = 4
      fortitude: { total: 4 },
      // 2 (dex) + 3 (trained at level 1) = 5
      reflex: { total: 5 },
      // 4 (wis) + 5 (expert at level 1) = 9
      will: { total: 9 },
      // 4 (wis) + 3 (trained at level 1) = 7
      perception: { total: 7 },
      // 10 (base) + 4 (wis, the Druid's key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (wis) + 3 (trained at level 1) = 7
      'skill:nature': { total: 7 },
      // 0 (int) + 0 (untrained) = 0
      'skill:society': { total: 0 },
      // 0 (str) + 3 (trained at level 1) = 3, no Multiple Attack Penalty on the first attack
      'strike:staff': { total: 3 },
    },
  },
  buildStatistics,
);
