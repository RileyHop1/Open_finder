import { resolveStatistic } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import type { ConditionTarget } from './conditionModifiers.js';
import { conditionModifiers } from './conditionModifiers.js';

const values = (slug: string, value: number | undefined, target: ConditionTarget) =>
  conditionModifiers([value === undefined ? { slug } : { slug, value }], target).map(
    (m) => m.value,
  );

const SKILL_ATTRIBUTE_CASES: [string, string, number[]][] = [
  ['clumsy', 'stealth', [-2]],
  ['clumsy', 'athletics', []],
  ['enfeebled', 'athletics', [-2]],
  ['enfeebled', 'stealth', []],
  ['stupefied', 'arcana', [-2]],
  ['stupefied', 'medicine', [-2]],
  ['stupefied', 'deception', [-2]],
  ['stupefied', 'crafting', [-2]],
  ['stupefied', 'acrobatics', []],
  ['drained', 'athletics', []],
];

describe('conditionModifiers', () => {
  it.each(SKILL_ATTRIBUTE_CASES)('%s 2 on %s -> %j', (slug, skill, expected) => {
    expect(values(slug, 2, { kind: 'skill', skill })).toEqual(expected);
  });

  it('applies an attribute penalty to the DCs and saves based on that attribute', () => {
    expect(values('clumsy', 1, { kind: 'ac' })).toEqual([-1]);
    expect(values('clumsy', 1, { kind: 'save', save: 'reflex' })).toEqual([-1]);
    expect(values('clumsy', 1, { kind: 'save', save: 'will' })).toEqual([]);
    expect(values('drained', 3, { kind: 'save', save: 'fortitude' })).toEqual([-3]);
    expect(values('stupefied', 2, { kind: 'save', save: 'will' })).toEqual([-2]);
    expect(values('stupefied', 2, { kind: 'perception' })).toEqual([-2]);
    expect(values('enfeebled', 1, { kind: 'classDc', keyAttribute: 'str' })).toEqual([
      -1,
    ]);
    expect(values('enfeebled', 1, { kind: 'classDc', keyAttribute: 'dex' })).toEqual([]);
  });

  it('applies to attacks by the attribute the attack adds', () => {
    expect(values('clumsy', 1, { kind: 'attack', attribute: 'dex' })).toEqual([-1]);
    expect(values('clumsy', 1, { kind: 'attack', attribute: 'str' })).toEqual([]);
    expect(values('enfeebled', 2, { kind: 'attack', attribute: 'str' })).toEqual([-2]);
  });

  it('applies frightened and sickened to every check and DC, but not damage or max HP', () => {
    const targets: ConditionTarget[] = [
      { kind: 'ac' },
      { kind: 'save', save: 'fortitude' },
      { kind: 'perception' },
      { kind: 'classDc', keyAttribute: 'cha' },
      { kind: 'skill', skill: 'academia-lore' },
      { kind: 'attack', attribute: 'str' },
    ];
    for (const target of targets) {
      expect(values('frightened', 2, target)).toEqual([-2]);
      expect(values('sickened', 1, target)).toEqual([-1]);
    }
    expect(values('frightened', 2, { kind: 'damage', attribute: 'str' })).toEqual([]);
    expect(values('frightened', 2, { kind: 'maxHp', level: 5 })).toEqual([]);
  });

  it('applies enfeebled to Strength damage only, and drained to max HP by level', () => {
    expect(values('enfeebled', 2, { kind: 'damage', attribute: 'str' })).toEqual([-2]);
    expect(values('enfeebled', 2, { kind: 'damage', attribute: 'dex' })).toEqual([]);
    expect(values('clumsy', 2, { kind: 'damage', attribute: 'dex' })).toEqual([]);
    expect(values('drained', 2, { kind: 'maxHp', level: 5 })).toEqual([-10]);
    expect(values('enfeebled', 2, { kind: 'maxHp', level: 5 })).toEqual([]);
  });

  it('treats a valued condition with no value as value 1', () => {
    expect(values('frightened', undefined, { kind: 'ac' })).toEqual([-1]);
  });

  it('applies the fixed penalties of binary conditions', () => {
    expect(values('off-guard', undefined, { kind: 'ac' })).toEqual([-2]);
    expect(values('off-guard', undefined, { kind: 'perception' })).toEqual([]);
    expect(values('prone', undefined, { kind: 'attack', attribute: 'str' })).toEqual([
      -2,
    ]);
    expect(values('fatigued', undefined, { kind: 'save', save: 'will' })).toEqual([-1]);
    expect(values('fatigued', undefined, { kind: 'ac' })).toEqual([-1]);
    expect(values('fascinated', undefined, { kind: 'skill', skill: 'stealth' })).toEqual([
      -2,
    ]);
    expect(values('unconscious', undefined, { kind: 'save', save: 'reflex' })).toEqual([
      -4,
    ]);
    expect(values('unconscious', undefined, { kind: 'ac' })).toEqual([-4, -2]);
    expect(values('unconscious', undefined, { kind: 'save', save: 'will' })).toEqual([]);
  });

  it('gives implied off-guard its own slug and a source naming the condition that caused it', () => {
    const [implied] = conditionModifiers([{ slug: 'prone' }], { kind: 'ac' });
    expect(implied).toMatchObject({
      slug: 'off-guard:prone',
      source: 'Prone',
      type: 'circumstance',
      value: -2,
    });
  });

  it('contributes nothing for a condition that changes no number', () => {
    for (const slug of [
      'dazzled',
      'slowed',
      'stunned',
      'dying',
      'wounded',
      'hidden',
      'nonsense',
    ]) {
      expect(values(slug, 2, { kind: 'ac' })).toEqual([]);
    }
  });
});

describe('conditionModifiers through resolveStatistic', () => {
  const base = {
    slug: 'base',
    label: 'Base',
    type: 'untyped' as const,
    value: 10,
    source: 'base',
    enabled: true,
  };

  it('does not stack two status penalties: the worse one applies and the other is suppressed', () => {
    const statistic = resolveStatistic([
      base,
      ...conditionModifiers(
        [
          { slug: 'clumsy', value: 1 },
          { slug: 'frightened', value: 2 },
        ],
        { kind: 'save', save: 'reflex' },
      ),
    ]);
    expect(statistic.total).toBe(8);
    const clumsy = statistic.modifiers.find((m) => m.slug === 'clumsy');
    expect(clumsy).toMatchObject({ applied: false, suppressedBy: 'frightened' });
  });

  it('counts off-guard once even when a second condition implies it', () => {
    const statistic = resolveStatistic([
      base,
      ...conditionModifiers([{ slug: 'off-guard' }, { slug: 'prone' }], { kind: 'ac' }),
    ]);
    expect(statistic.total).toBe(8);
  });

  it('stacks a status penalty with a circumstance penalty', () => {
    const statistic = resolveStatistic([
      base,
      ...conditionModifiers([{ slug: 'frightened', value: 1 }, { slug: 'off-guard' }], {
        kind: 'ac',
      }),
    ]);
    expect(statistic.total).toBe(7);
  });
});
