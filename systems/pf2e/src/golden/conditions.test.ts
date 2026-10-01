import { describe, expect, it } from 'vitest';

import type { AppliedCondition, ArmorEntry, WeaponEntry } from '../index.js';
import { prepareCharacter } from '../index.js';
import { describeGolden } from './describeGolden.js';
import { goldenCharacter, goldenStatistics } from './goldenCharacter.js';

/**
 * Conditions on the golden Fighter (milestone 3). Each fixture applies one
 * condition set to the same level 1 Fighter and pins every statistic it
 * should move *and* the ones it should leave alone, so a condition that
 * starts hitting the wrong attribute fails here. Hand-computed from the
 * unconditioned values, which are:
 *
 *   AC 18, Fortitude 7, Reflex 7, Will 4, Perception 6, Class DC 17,
 *   Athletics 7 (4 str + 3 trained), Acrobatics 2, Stealth 2,
 *   Religion 1, longsword 9, max HP 20.
 *
 * Condition numbers are checked against Archives of Nethys (2026-09-30);
 * see `docs/conditions.md`, and the entries in `docs/rulings.md` this file
 * pins: implied off-guard, and which conditions change a number at all.
 */
const IMPORTED_AT = '2026-09-30T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const ARMOR: ArmorEntry = {
  id: '20000000-0001-5000-8000-000000000001',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-breastplate',
  name: 'Invented Breastplate',
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
  id: '20000000-0002-5000-8000-000000000002',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-longsword',
  name: 'Invented Longsword',
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

function fighterWith(conditions: readonly AppliedCondition[]) {
  return goldenCharacter({
    level: 1,
    scores: { str: 18, dex: 14, con: 14, int: 10, wis: 12, cha: 10 },
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
    ancestryHp: 8,
    classHp: 10,
    conditions,
  });
}

const prepared = (conditions: readonly AppliedCondition[]) =>
  prepareCharacter(fighterWith(conditions));
const statisticsOf = (conditions: readonly AppliedCondition[]) =>
  goldenStatistics(prepared(conditions), 'longsword');

describeGolden(
  {
    name: 'Fighter -- frightened 2 (every check and DC, nothing else)',
    statistics: {
      ac: { total: 16 },
      fortitude: { total: 5 },
      reflex: { total: 5 },
      will: { total: 2 },
      perception: { total: 4 },
      classDc: { total: 15 },
      'skill:athletics': { total: 5 },
      'skill:acrobatics': { total: 0 },
      'strike:longsword': { total: 7 },
      // Frightened does not touch maximum HP.
      'hp:max': { total: 20 },
    },
  },
  () => statisticsOf([{ slug: 'frightened', value: 2 }]),
);

describeGolden(
  {
    name: 'Fighter -- clumsy 1 (Dexterity-based only; the Strength strike and class DC are untouched)',
    statistics: {
      // AC is a Dexterity-based DC.
      ac: { total: 17 },
      fortitude: { total: 7 },
      reflex: { total: 6 },
      will: { total: 4 },
      perception: { total: 6 },
      classDc: { total: 17 },
      'skill:athletics': { total: 7 },
      'skill:acrobatics': { total: 1 },
      'skill:stealth': { total: 1 },
      'strike:longsword': { total: 9 },
    },
  },
  () => statisticsOf([{ slug: 'clumsy', value: 1 }]),
);

describeGolden(
  {
    name: 'Fighter -- clumsy 1 and frightened 2 (status penalties do not stack: the worse applies)',
    statistics: {
      ac: {
        total: 16,
        modifiers: [
          { slug: 'frightened', applied: true },
          { slug: 'clumsy', applied: false, suppressedBy: 'frightened' },
        ],
      },
      reflex: {
        total: 5,
        modifiers: [
          { slug: 'clumsy', applied: false, suppressedBy: 'frightened' },
          { slug: 'frightened', applied: true },
        ],
      },
      'skill:acrobatics': { total: 0 },
      // Clumsy does not apply to Athletics, so frightened is the only penalty there.
      'skill:athletics': {
        total: 5,
        modifiers: [{ slug: 'frightened', applied: true }],
      },
    },
  },
  () =>
    statisticsOf([
      { slug: 'clumsy', value: 1 },
      { slug: 'frightened', value: 2 },
    ]),
);

describeGolden(
  {
    name: 'Fighter -- stupefied 2 (Intelligence, Wisdom, and Charisma only)',
    statistics: {
      ac: { total: 18 },
      fortitude: { total: 7 },
      reflex: { total: 7 },
      will: { total: 2 },
      perception: { total: 4 },
      'skill:religion': { total: -1 },
      'skill:athletics': { total: 7 },
    },
  },
  () => statisticsOf([{ slug: 'stupefied', value: 2 }]),
);

describeGolden(
  {
    name: 'Fighter -- enfeebled 2 (Strength-based attack, DC, and check)',
    statistics: {
      ac: { total: 18 },
      classDc: { total: 15 },
      'skill:athletics': { total: 5 },
      'skill:acrobatics': { total: 2 },
      'strike:longsword': { total: 7 },
    },
  },
  () => statisticsOf([{ slug: 'enfeebled', value: 2 }]),
);

describeGolden(
  {
    name: 'Fighter -- drained 1 (Constitution-based, and max HP by level)',
    statistics: {
      fortitude: { total: 6 },
      reflex: { total: 7 },
      ac: { total: 18 },
      // 8 + (10 + 2) * 1 - (1 * 1)
      'hp:max': { total: 19 },
    },
  },
  () => statisticsOf([{ slug: 'drained', value: 1 }]),
);

describeGolden(
  {
    name: 'Fighter -- off-guard, prone: implied off-guard is counted once',
    statistics: {
      // -2 circumstance to AC, once. The earlier modifier in the list wins the tie.
      ac: {
        total: 16,
        modifiers: [
          { slug: 'off-guard', applied: true },
          { slug: 'off-guard:prone', applied: false, suppressedBy: 'off-guard' },
        ],
      },
      // Prone: -2 circumstance to attack rolls.
      'strike:longsword': { total: 7 },
      reflex: { total: 7 },
    },
  },
  () => statisticsOf([{ slug: 'off-guard' }, { slug: 'prone' }]),
);

describeGolden(
  {
    name: 'Fighter -- unconscious (-4 status plus implied off-guard stack as different types)',
    statistics: {
      // 18 - 4 (status) - 2 (circumstance off-guard)
      ac: { total: 12 },
      // 6 - 4
      perception: { total: 2 },
      // 7 - 4
      reflex: { total: 3 },
      fortitude: { total: 7 },
      will: { total: 4 },
    },
  },
  () => statisticsOf([{ slug: 'unconscious' }]),
);

describe('Fighter -- conditions that change no number', () => {
  it.each(['slowed', 'stunned', 'dazzled', 'hidden', 'dying', 'wounded'])(
    '%s leaves every statistic exactly as it was',
    (slug) => {
      const before = prepared([]);
      const after = prepared([{ slug, value: 2 }]);
      for (const [name, statistic] of Object.entries(before.statistics)) {
        expect(after.statistics[name]?.total).toBe(statistic.total);
      }
      expect(after.hp.max.total).toBe(before.hp.max.total);
    },
  );
});

describe('Fighter -- enfeebled 2 on damage', () => {
  it('lowers the Strength damage modifier from +4 to +2', () => {
    const [strike] = prepared([{ slug: 'enfeebled', value: 2 }]).strikes;
    expect(strike?.damageModifiers.total).toBe(2);
    expect(strike?.damage.normal).toEqual([
      { expression: '1d8+2', damageType: 'slashing' },
    ]);
  });
});
