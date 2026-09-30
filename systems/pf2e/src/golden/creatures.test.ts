import type { DamageComponent, RandomSource } from '@hearthtable/dice';
import { degreeOfSuccess, evaluate, evaluateDamage, parse } from '@hearthtable/dice';
import { describe, expect, it } from 'vitest';

import type { CreatureEntry, CreatureStrikeDamage } from '../index.js';
import { creatureEntrySchema } from '../index.js';

/**
 * Two invented monsters with hand-computed stats -- never a published stat
 * block (ADR 0003's consequences, ADR 0013). Unlike a golden PC, a
 * creature's numbers are already the finished product: `creature.ts`'s
 * module doc is explicit that nothing here runs through `resolveStatistic`,
 * so there is no Stack D builder to call the way `fighter.test.ts` calls
 * `buildArmorClass`. What this file actually proves is narrower and just as
 * real: that `creatureEntrySchema` accepts a genuine stat block shape, and
 * that a creature's strike -- attack bonus and damage dice alike -- rolls
 * correctly through `@hearthtable/dice`, the same evaluator a PC's strike
 * uses, once its already-finished numbers are handed to it directly instead
 * of built up from proficiency and an ability modifier.
 */
const IMPORTED_AT = '2026-09-30T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Monster Core',
  license: 'ORC' as const,
  remaster: true as const,
};

/** A scripted RNG returning one value per call, in order -- local to this test file since `@hearthtable/dice`'s own equivalent is not exported outside its package. */
function sequenceRandomSource(values: readonly number[]): RandomSource {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) {
      throw new Error(`sequenceRandomSource exhausted after ${index} call(s)`);
    }
    index += 1;
    return value;
  };
}

/** Converts a creature's already-finished damage entries into `@hearthtable/dice`'s generic `DamageComponent[]` -- the same target shape `strikeDamage.ts` builds for a PC. */
function damageComponents(damage: readonly CreatureStrikeDamage[]): DamageComponent[] {
  return damage.map((component) => {
    const dice = `${component.diceNumber}d${component.dieFaces}`;
    const expression =
      component.bonus === 0
        ? dice
        : component.bonus > 0
          ? `${dice}+${component.bonus}`
          : `${dice}${component.bonus}`;
    return { expression, damageType: component.damageType };
  });
}

const BOG_STRANGLER: CreatureEntry = {
  id: '20000000-0001-5000-8000-000000000001',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'bestiary',
  slug: 'invented-bog-strangler',
  name: 'Invented Bog Strangler',
  kind: 'creature',
  provenance: PROVENANCE,
  traits: ['aquatic', 'amphibious'],
  ruleElements: [],
  description: '',
  level: 3,
  size: 'medium',
  perception: 8,
  ac: 18,
  savingThrows: { fortitude: 9, reflex: 6, will: 7 },
  hp: 45,
  resistances: [{ damageType: 'cold', value: 5 }],
  weaknesses: [{ damageType: 'fire', value: 5 }],
  speeds: { land: 20, swim: 25 },
  attributes: { str: 3, dex: 1, con: 3, int: -4, wis: 1, cha: -1 },
  skills: { athletics: 11, stealth: 9, 'nature-lore': 6 },
  strikes: [
    {
      name: 'tentacle',
      attackBonus: 11,
      traits: ['reach-10', 'grab'],
      damage: [{ diceNumber: 2, dieFaces: 6, bonus: 3, damageType: 'bludgeoning' }],
    },
  ],
  languages: ['invented-bog-speech'],
};

const CINDER_WHELP: CreatureEntry = {
  id: '20000000-0002-5000-8000-000000000002',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'bestiary',
  slug: 'invented-cinder-whelp',
  name: 'Invented Cinder Whelp',
  kind: 'creature',
  provenance: PROVENANCE,
  traits: ['fire', 'animal'],
  ruleElements: [],
  description: '',
  level: 1,
  size: 'small',
  perception: 5,
  ac: 15,
  savingThrows: { fortitude: 5, reflex: 8, will: 3 },
  hp: 20,
  resistances: [{ damageType: 'fire', value: 10 }],
  weaknesses: [{ damageType: 'cold', value: 5 }],
  speeds: { land: 25, fly: 30 },
  attributes: { str: -1, dex: 4, con: 1, int: -3, wis: 0, cha: 1 },
  skills: { acrobatics: 8, stealth: 8 },
  strikes: [
    {
      name: 'bite',
      attackBonus: 8,
      traits: ['finesse'],
      damage: [
        { diceNumber: 1, dieFaces: 6, bonus: 1, damageType: 'piercing' },
        { diceNumber: 1, dieFaces: 4, bonus: 0, damageType: 'fire' },
      ],
    },
  ],
  languages: [],
};

describe('golden creatures -- schema', () => {
  it.each([
    ['Invented Bog Strangler', BOG_STRANGLER],
    ['Invented Cinder Whelp', CINDER_WHELP],
  ] as const)('%s validates against creatureEntrySchema', (_name, creature) => {
    const result = creatureEntrySchema.safeParse(creature);
    expect(result.success).toBe(true);
  });
});

describe('Invented Bog Strangler -- strike', () => {
  it('rolls the tentacle attack against an invented target AC', () => {
    const strike = BOG_STRANGLER.strikes[0]!;
    const expression = `1d20+${strike.attackBonus}`;
    const parsed = parse(expression);
    if (!parsed.ok) {
      throw new Error(`expected "${expression}" to parse`);
    }
    const evaluated = evaluate(expression, parsed.expression, {
      rng: sequenceRandomSource([14]),
    });
    if (!evaluated.ok) {
      throw new Error('expected the attack roll to evaluate');
    }

    // roll 14 + attack bonus 11 = 25 vs an invented DC of 20: a success.
    expect(evaluated.result.total).toBe(25);
    expect(degreeOfSuccess(evaluated.result.total, 20, 14)).toBe('success');
  });

  it('rolls the tentacle damage', () => {
    const strike = BOG_STRANGLER.strikes[0]!;
    const result = evaluateDamage(damageComponents(strike.damage), false, {
      rng: sequenceRandomSource([4, 5]),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 2d6 (4 + 5) + 3 = 12
      expect(result.result.total).toBe(12);
      expect(result.result.damage).toEqual({ bludgeoning: 12 });
    }
  });
});

describe('Invented Cinder Whelp -- strike', () => {
  it('rolls the bite attack against an invented target AC', () => {
    const strike = CINDER_WHELP.strikes[0]!;
    const expression = `1d20+${strike.attackBonus}`;
    const parsed = parse(expression);
    if (!parsed.ok) {
      throw new Error(`expected "${expression}" to parse`);
    }
    const evaluated = evaluate(expression, parsed.expression, {
      rng: sequenceRandomSource([2]),
    });
    if (!evaluated.ok) {
      throw new Error('expected the attack roll to evaluate');
    }

    // roll 2 + attack bonus 8 = 10, ten short of an invented DC of 20: a critical failure.
    expect(evaluated.result.total).toBe(10);
    expect(degreeOfSuccess(evaluated.result.total, 20, 2)).toBe('criticalFailure');
  });

  it('rolls the bite damage across both its physical and fire components', () => {
    const strike = CINDER_WHELP.strikes[0]!;
    const result = evaluateDamage(damageComponents(strike.damage), false, {
      rng: sequenceRandomSource([5, 3]),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // piercing: 1d6 (5) + 1 = 6; fire: 1d4 (3) + 0 = 3
      expect(result.result.damage).toEqual({ piercing: 6, fire: 3 });
      expect(result.result.total).toBe(9);
    }
  });
});
