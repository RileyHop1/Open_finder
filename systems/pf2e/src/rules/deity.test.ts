import { describe, expect, it } from 'vitest';

import {
  deitySkill,
  deityWarnings,
  sanctificationWarnings,
  servesDeity,
} from './deity.js';

// An invented deity's facts (ADR 0013): nothing here is a real deity's entry.
const deity = { name: 'The Lantern', font: 'heal' as const, skill: 'medicine' };

describe('servesDeity', () => {
  it('is the Cleric and the Champion', () => {
    expect(servesDeity('cleric')).toBe(true);
    expect(servesDeity('champion')).toBe(true);
    expect(servesDeity('fighter')).toBe(false);
    expect(servesDeity(undefined)).toBe(false);
  });
});

describe('deitySkill', () => {
  it('is the deity’s divine skill for a class that serves one', () => {
    expect(deitySkill('cleric', { deity })).toBe('medicine');
    expect(deitySkill('champion', { deity: { skill: 'religion' } })).toBe('religion');
  });

  it('is none for another class, or no skill entered', () => {
    expect(deitySkill('wizard', { deity })).toBeUndefined();
    expect(deitySkill('cleric', {})).toBeUndefined();
  });
});

describe('deityWarnings', () => {
  it('asks a Cleric or Champion with no deity facts for them', () => {
    expect(deityWarnings('cleric', { classChoices: {} })).toEqual([
      { kind: 'deity-not-set', classSlug: 'cleric' },
    ]);
    expect(deityWarnings('champion', { deity: {}, classChoices: {} })).toEqual([
      { kind: 'deity-not-set', classSlug: 'champion' },
    ]);
  });

  it('warns about a font the deity does not grant, and not for one that grants either', () => {
    expect(
      deityWarnings('cleric', { deity, classChoices: { 'divine-font': 'harm' } }),
    ).toEqual([{ kind: 'font-not-granted', font: 'harm', granted: 'heal' }]);
    expect(
      deityWarnings('cleric', { deity, classChoices: { 'divine-font': 'heal' } }),
    ).toEqual([]);
    expect(
      deityWarnings('cleric', {
        deity: { ...deity, font: 'either' },
        classChoices: { 'divine-font': 'harm' },
      }),
    ).toEqual([]);
  });

  it('says nothing for a class without a deity', () => {
    expect(deityWarnings('fighter', { classChoices: {} })).toEqual([]);
  });
});

describe('sanctificationWarnings', () => {
  const holy = { slug: 'invented-glory', tags: ['invented-cause', 'holy'] };
  const unholy = { slug: 'invented-ruin', tags: ['invented-cause', 'unholy'] };
  const either = { slug: 'invented-oath', tags: ['invented-cause'] };

  it('says nothing when the sanctification matches, or the feature has none', () => {
    expect(
      sanctificationWarnings([holy, either], { deity: { sanctification: 'holy' } }),
    ).toEqual([]);
    expect(sanctificationWarnings([either], {})).toEqual([]);
  });

  it('warns about a holy or unholy feature the sanctification does not match', () => {
    expect(
      sanctificationWarnings([unholy], { deity: { sanctification: 'holy' } }),
    ).toEqual([
      {
        kind: 'sanctification-mismatch',
        feature: 'invented-ruin',
        needs: 'unholy',
        sanctification: 'holy',
      },
    ]);
  });

  it('warns, with no sanctification named, when none was entered', () => {
    expect(sanctificationWarnings([holy], { deity: { name: 'The Lantern' } })).toEqual([
      { kind: 'sanctification-mismatch', feature: 'invented-glory', needs: 'holy' },
    ]);
  });
});
