import { degreeOfSuccess, evaluate, evaluateDamage, parse } from '@hearthtable/dice';
import { describe, expect, it } from 'vitest';

import type { CreatureEntry } from '../index.js';
import { newNpcFromCreature, prepareNpc } from '../index.js';
import { BOG_STRANGLER, CINDER_WHELP, sequenceRandomSource } from './goldenCreatures.js';

/**
 * The golden creatures, run through `prepareNpc` -- the same path the sheet and
 * the server's roll handlers use -- so a change to how a monster's numbers are
 * built (a condition mapping, the Multiple Attack Penalty, the strike attribute
 * rule) shows up here as a failing golden value. Every number is computed by hand
 * from the fixtures in `goldenCreatures.ts`, never read back from the code.
 */

function prepared(
  creature: CreatureEntry,
  conditions: { slug: string; value?: number }[] = [],
) {
  return prepareNpc({ ...newNpcFromCreature(creature), conditions });
}

/** Every statistic's total, keyed as the sheet keys them. */
function totals(
  creature: CreatureEntry,
  conditions: { slug: string; value?: number }[] = [],
) {
  return Object.fromEntries(
    Object.entries(prepared(creature, conditions).statistics).map(([key, stat]) => [
      key,
      stat.total,
    ]),
  );
}

/** Rolls `1d20` plus a prepared attack total with a scripted die, as the server does. */
function attack(total: number, natural: number, dc: number) {
  const expression = total >= 0 ? `1d20+${total}` : `1d20${total}`;
  const parsed = parse(expression);
  if (!parsed.ok) {
    throw new Error(`expected "${expression}" to parse`);
  }
  const evaluated = evaluate(expression, parsed.expression, {
    rng: sequenceRandomSource([natural]),
  });
  if (!evaluated.ok) {
    throw new Error('expected the attack roll to evaluate');
  }
  return {
    total: evaluated.result.total,
    degree: degreeOfSuccess(evaluated.result.total, dc, natural),
  };
}

describe('Invented Bog Strangler through prepareNpc', () => {
  it('reads its printed numbers', () => {
    expect(totals(BOG_STRANGLER)).toEqual({
      ac: 18,
      perception: 8,
      fortitude: 9,
      reflex: 6,
      will: 7,
      'skill:athletics': 11,
      'skill:stealth': 9,
      'skill:nature-lore': 6,
    });
    expect(prepared(BOG_STRANGLER).hp.max.total).toBe(45);
  });

  it('prepares the tentacle: +11, then +6 and +1 after the Multiple Attack Penalty', () => {
    const [tentacle] = prepared(BOG_STRANGLER).strikes;
    expect(tentacle?.key).toBe('strike:tentacle');
    expect(tentacle?.attackAttribute).toBe('str');
    expect(tentacle?.attacks.map((a) => a.total)).toEqual([11, 6, 1]);
    expect(tentacle?.damage.normal).toEqual([
      { expression: '2d6+3', damageType: 'bludgeoning' },
    ]);
  });

  it('rolls the prepared tentacle for the same results as the raw stat block', () => {
    const [tentacle] = prepared(BOG_STRANGLER).strikes;
    // natural 14 + 11 = 25 against an invented DC of 20: a success.
    expect(attack(tentacle!.attacks[0].total, 14, 20)).toEqual({
      total: 25,
      degree: 'success',
    });
    const damage = evaluateDamage(tentacle!.damage.normal, false, {
      rng: sequenceRandomSource([4, 5]),
    });
    expect(damage.ok && damage.result.total).toBe(12);
  });

  it('frightened 2 lowers every check and DC by 2, and its strike with them', () => {
    const conditions = [{ slug: 'frightened', value: 2 }];
    expect(totals(BOG_STRANGLER, conditions)).toEqual({
      ac: 16,
      perception: 6,
      fortitude: 7,
      reflex: 4,
      will: 5,
      'skill:athletics': 9,
      'skill:stealth': 7,
      'skill:nature-lore': 4,
    });
    const [tentacle] = prepared(BOG_STRANGLER, conditions).strikes;
    expect(tentacle?.attacks.map((a) => a.total)).toEqual([9, 4, -1]);
    // Damage is untouched, and so are hit points.
    expect(tentacle?.damage.normal).toEqual([
      { expression: '2d6+3', damageType: 'bludgeoning' },
    ]);
    expect(prepared(BOG_STRANGLER, conditions).hp.max.total).toBe(45);
  });

  it('frightened 2 turns a roll that just succeeded into one that just misses', () => {
    // natural 10 + 11 = 21 against DC 20 succeeds; frightened 2 makes it 10 + 9 = 19, a failure.
    const healthy = prepared(BOG_STRANGLER).strikes[0]!.attacks[0].total;
    const scared = prepared(BOG_STRANGLER, [{ slug: 'frightened', value: 2 }]).strikes[0]!
      .attacks[0].total;
    expect(attack(healthy, 10, 20).degree).toBe('success');
    expect(attack(scared, 10, 20)).toEqual({ total: 19, degree: 'failure' });
  });

  it('clumsy 1 lowers only the Dexterity numbers, not its Strength strike', () => {
    const conditions = [{ slug: 'clumsy', value: 1 }];
    expect(totals(BOG_STRANGLER, conditions)).toEqual({
      ac: 17,
      perception: 8,
      fortitude: 9,
      reflex: 5,
      will: 7,
      'skill:athletics': 11,
      'skill:stealth': 8,
      'skill:nature-lore': 6,
    });
    expect(prepared(BOG_STRANGLER, conditions).strikes[0]?.attacks[0].total).toBe(11);
  });

  it('frightened 2 and clumsy 1 together are -2 on AC, not -3', () => {
    const conditions = [
      { slug: 'frightened', value: 2 },
      { slug: 'clumsy', value: 1 },
    ];
    expect(totals(BOG_STRANGLER, conditions).ac).toBe(16);
    expect(totals(BOG_STRANGLER, conditions.reverse()).ac).toBe(16);
  });

  it('enfeebled 2 lowers the strike, its damage, and Athletics', () => {
    const conditions = [{ slug: 'enfeebled', value: 2 }];
    const prep = prepared(BOG_STRANGLER, conditions);
    expect(prep.strikes[0]?.attacks[0].total).toBe(9);
    expect(prep.strikes[0]?.damage.normal).toEqual([
      { expression: '2d6+1', damageType: 'bludgeoning' },
    ]);
    expect(prep.statistics['skill:athletics']?.total).toBe(9);
    expect(prep.statistics.ac?.total).toBe(18);
  });

  it('stupefied 2 lowers Perception, Will, and the Intelligence-based Lore skill', () => {
    const conditions = [{ slug: 'stupefied', value: 2 }];
    expect(totals(BOG_STRANGLER, conditions)).toMatchObject({
      perception: 6,
      will: 5,
      'skill:nature-lore': 4,
      'skill:athletics': 11,
      ac: 18,
    });
  });

  it('drained 2 lowers Fortitude by 2 and maximum hit points by level 3 x 2', () => {
    const prep = prepared(BOG_STRANGLER, [{ slug: 'drained', value: 2 }]);
    expect(prep.statistics.fortitude?.total).toBe(7);
    expect(prep.hp.max.total).toBe(39);
  });

  it('prone is off-guard: -2 to AC, and -2 to its own attacks', () => {
    const prep = prepared(BOG_STRANGLER, [{ slug: 'prone' }]);
    expect(prep.statistics.ac?.total).toBe(16);
    expect(prep.strikes[0]?.attacks[0].total).toBe(9);
  });
});

describe('Invented Cinder Whelp through prepareNpc', () => {
  it('reads its printed numbers', () => {
    expect(totals(CINDER_WHELP)).toEqual({
      ac: 15,
      perception: 5,
      fortitude: 5,
      reflex: 8,
      will: 3,
      'skill:acrobatics': 8,
      'skill:stealth': 8,
    });
    expect(prepared(CINDER_WHELP).hp.max.total).toBe(20);
  });

  it('prepares the finesse bite as a Dexterity strike, with both damage components', () => {
    const [bite] = prepared(CINDER_WHELP).strikes;
    expect(bite?.key).toBe('strike:bite');
    expect(bite?.attackAttribute).toBe('dex');
    expect(bite?.attacks.map((a) => a.total)).toEqual([8, 3, -2]);
    expect(bite?.damage.normal).toEqual([
      { expression: '1d6+1', damageType: 'piercing' },
      { expression: '1d4', damageType: 'fire' },
    ]);
  });

  it('rolls the prepared bite damage across both components', () => {
    const [bite] = prepared(CINDER_WHELP).strikes;
    const result = evaluateDamage(bite!.damage.normal, false, {
      rng: sequenceRandomSource([5, 3]),
    });
    // piercing: 1d6 (5) + 1 = 6; fire: 1d4 (3) = 3.
    expect(result.ok && result.result.damage).toEqual({ piercing: 6, fire: 3 });
  });

  it('frightened 2 lowers its AC to 13 and its bite to +6, +1, -4', () => {
    const conditions = [{ slug: 'frightened', value: 2 }];
    expect(totals(CINDER_WHELP, conditions)).toEqual({
      ac: 13,
      perception: 3,
      fortitude: 3,
      reflex: 6,
      will: 1,
      'skill:acrobatics': 6,
      'skill:stealth': 6,
    });
    expect(
      prepared(CINDER_WHELP, conditions).strikes[0]?.attacks.map((a) => a.total),
    ).toEqual([6, 1, -4]);
  });

  it('clumsy 1 lowers its Dexterity bite as well as AC, Reflex, and its Dexterity skills', () => {
    const conditions = [{ slug: 'clumsy', value: 1 }];
    expect(totals(CINDER_WHELP, conditions)).toMatchObject({
      ac: 14,
      reflex: 7,
      'skill:acrobatics': 7,
      'skill:stealth': 7,
      fortitude: 5,
    });
    expect(
      prepared(CINDER_WHELP, conditions).strikes[0]?.attacks.map((a) => a.total),
    ).toEqual([7, 2, -3]);
  });

  it('enfeebled 1 leaves the Dexterity bite to hit, but lowers its Strength damage', () => {
    const [bite] = prepared(CINDER_WHELP, [{ slug: 'enfeebled', value: 1 }]).strikes;
    expect(bite?.attacks[0].total).toBe(8);
    expect(bite?.damage.normal).toEqual([
      { expression: '1d6', damageType: 'piercing' },
      { expression: '1d4', damageType: 'fire' },
    ]);
  });

  it('frightened 2 and clumsy 1 together are -2 on AC (13), not -3', () => {
    expect(
      totals(CINDER_WHELP, [
        { slug: 'frightened', value: 2 },
        { slug: 'clumsy', value: 1 },
      ]).ac,
    ).toBe(13);
  });

  it('drained 1 lowers maximum hit points by its level, 1', () => {
    const prep = prepared(CINDER_WHELP, [{ slug: 'drained', value: 1 }]);
    expect(prep.hp.max.total).toBe(19);
    expect(prep.statistics.fortitude?.total).toBe(4);
  });
});
