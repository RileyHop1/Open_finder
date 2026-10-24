import { describe, expect, it } from 'vitest';

import { deitySkill, deityWarnings, servesDeity } from './deity.js';

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
