import { degreeOfSuccess, evaluate, evaluateDamage, parse } from '@hearthtable/dice';
import { describe, expect, it } from 'vitest';

import { creatureEntrySchema } from '../index.js';
import {
  BOG_STRANGLER,
  CINDER_WHELP,
  damageComponents,
  sequenceRandomSource,
} from './goldenCreatures.js';

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
