import { sequenceRandomSource } from '@hearthtable/dice/testing';
import { describe, expect, it } from 'vitest';

import type { ArmorEntry, GearEntry, WeaponEntry } from '../index.js';
import { prepareCharacter, rollStrikeAttack, rollStrikeDamage } from '../index.js';
import { describeGolden } from './describeGolden.js';
import { equipped, goldenCharacter, goldenStatistics } from './goldenCharacter.js';

/**
 * A level 1 Fighter, built by hand -- never a published stat block, per
 * ADR 0013's "golden characters are built by us" rule. Class proficiencies
 * below are confirmed against Archives of Nethys' Fighter class page
 * (Player Core): Perception Expert; Fortitude and Reflex Expert, Will
 * Trained; unarmed/simple/martial weapons Expert, advanced Trained; Class
 * DC Trained; all armor Trained. Ability scores and equipment are chosen
 * directly rather than derived through character creation -- which boosts
 * a character receives and from where is milestone 7's wizard, not
 * something this fixture models (see `attributes.ts`'s module doc).
 *
 * Since milestone 3 this fixture goes through `prepareCharacter`, the same
 * path the sheet and the server use, rather than calling each builder by
 * hand. Its expected values did not change in the move.
 */
const LEVEL = 1;

const SCORES = { str: 18, dex: 14, con: 14, int: 10, wis: 12, cha: 10 } as const;

const IMPORTED_AT = '2026-09-29T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: '44444444-4444-5444-8444-444444444444',
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
  id: '55555555-5555-5555-8555-555555555555',
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

/** An invented effect granting a circumstance bonus to Athletics, through a rule element rather than a hand-passed modifier. */
function terrainEffect(name: string, slug: string, value: number): GearEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'equipment',
    slug: slug,
    name,
    kind: 'gear',
    provenance: PROVENANCE,
    traits: [],
    description: '',
    ruleElements: [
      {
        kind: 'flatModifier',
        selector: 'skill:athletics',
        slug,
        label: name,
        type: 'circumstance',
        value,
      },
    ],
  };
}

function buildCharacter() {
  return goldenCharacter({
    level: LEVEL,
    scores: SCORES,
    keyAttribute: 'str',
    ranks: {
      perception: 'expert',
      fortitude: 'expert',
      reflex: 'expert',
      will: 'trained',
      classDc: 'trained',
      armor: 'trained',
      weapon: 'expert',
    },
    armor: ARMOR,
    weapon: WEAPON,
    skills: { athletics: 'trained' },
    // Two circumstance bonuses of the same sign -- only the larger one
    // should apply, exercising the harness's suppression assertion
    // (ADR 0008's consequences section), not just its total.
    extraItems: [
      equipped(terrainEffect('Invented Terrain Effect', 'terrain', 2)),
      equipped(terrainEffect('Invented Lesser Terrain Effect', 'lesser-terrain', 1)),
    ],
    ancestryHp: 8,
    classHp: 10,
  });
}

describeGolden(
  {
    name: 'Fighter (level 1)',
    statistics: {
      // 10 (base) + 1 (dex, capped from +2 by the breastplate's dexCap) + 3 (trained at level 1) + 4 (armor) = 18
      ac: {
        total: 18,
        modifiers: [
          { slug: 'base', applied: true },
          { slug: 'dexterity', applied: true },
          { slug: 'proficiency', applied: true },
          { slug: 'armor', applied: true },
        ],
      },
      // 2 (con) + 5 (expert at level 1) = 7
      fortitude: { total: 7 },
      // 2 (dex, uncapped -- only AC caps it) + 5 (expert at level 1) = 7
      reflex: { total: 7 },
      // 1 (wis) + 3 (trained at level 1) = 4
      will: { total: 4 },
      // 1 (wis) + 5 (expert at level 1) = 6
      perception: { total: 6 },
      // 10 (base) + 4 (str, the Fighter's chosen key attribute) + 3 (trained at level 1) = 17
      classDc: { total: 17 },
      // 4 (str) + 3 (trained at level 1) + 2 (the larger circumstance bonus) = 9
      'skill:athletics': {
        total: 9,
        modifiers: [
          { slug: 'terrain', applied: true },
          { slug: 'lesser-terrain', applied: false, suppressedBy: 'terrain' },
        ],
      },
      // 2 (dex) + 0 (untrained) = 2
      'skill:acrobatics': { total: 2 },
      // 4 (str) + 5 (expert at level 1) = 9, no Multiple Attack Penalty on the first attack
      'strike:longsword': { total: 9 },
      // 8 (ancestry) + (10 (class) + 2 (con)) * 1 (level) = 20
      'hp:max': { total: 20 },
    },
  },
  () => goldenStatistics(prepareCharacter(buildCharacter()), 'longsword'),
);

describe('Fighter (level 1) -- strike roll', () => {
  const strike = prepareCharacter(buildCharacter()).strikes[0];
  if (strike === undefined) {
    throw new Error('the golden Fighter should have a strike');
  }

  it('rolls the longsword attack against an invented target AC', () => {
    const result = rollStrikeAttack({
      ...strike.attackInputs,
      attackNumber: 1,
      dc: 20,
      rng: sequenceRandomSource([15]),
    });

    // attack total 9 (4 str + 5 expert at level 1); roll 15 + 9 = 24 vs DC 20: a success, not a critical.
    expect(result.statistic.total).toBe(9);
    expect(result.roll.total).toBe(24);
    expect(result.degree).toBe('success');
  });

  it('rolls the longsword damage on a hit, and doubles the total on a critical hit', () => {
    const hit = rollStrikeDamage({
      ...strike.damageInputs,
      critical: false,
      rng: sequenceRandomSource([5]),
    });
    expect(hit.ok).toBe(true);
    if (hit.ok) {
      // 5 (weapon die) + 4 (str) = 9
      expect(hit.result.total).toBe(9);
    }

    const critical = rollStrikeDamage({
      ...strike.damageInputs,
      critical: true,
      rng: sequenceRandomSource([5]),
    });
    expect(critical.ok).toBe(true);
    if (critical.ok) {
      // (5 + 4) * 2 = 18, doubling the whole total rather than just the die.
      expect(critical.result.total).toBe(18);
    }
  });
});
