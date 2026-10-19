import { describe, expect, it } from 'vitest';

import {
  castingPlan,
  choiceWords,
  classGifts,
  isPicked,
  togglePick,
} from './spellPlan.js';

describe('castingPlan', () => {
  it('has no plan for a class that does not cast, or no class', () => {
    expect(castingPlan('fighter')).toBeUndefined();
    expect(castingPlan(undefined)).toBeUndefined();
  });

  it('gives a fixed-tradition caster its list and what its rank 1 picks are', () => {
    expect(castingPlan('bard')).toEqual({
      kind: 'spontaneous',
      tradition: 'occult',
      traditionChoice: undefined,
      cantrips: 5,
      known: 2,
      rankedLabel: 'Rank 1 spells you know',
    });
    expect(castingPlan('sorcerer')?.known).toBe(3);
    expect(castingPlan('cleric')?.known).toBeUndefined();
    expect(castingPlan('cleric')?.rankedLabel).toBe('Rank 1 spells to prepare from');
    expect(castingPlan('wizard')?.rankedLabel).toBe('Rank 1 spells in your spellbook');
  });

  it('names the choice that decides the list when the class has no fixed one', () => {
    expect(castingPlan('witch')).toMatchObject({
      tradition: undefined,
      traditionChoice: 'patron',
    });
    expect(castingPlan('sorcerer')?.traditionChoice).toBe('bloodline');
  });

  it('takes a Witch’s list from the patron chosen', () => {
    expect(castingPlan('witch', { patron: 'faiths-flamekeeper' })).toMatchObject({
      tradition: 'divine',
      traditionChoice: 'patron',
    });
  });
});

describe('togglePick', () => {
  const zap = { packId: 'spells', slug: 'zap' };
  const none = { cantrips: [], ranked: [] };

  it('adds a pick to one list, and takes it off again', () => {
    const once = togglePick(none, 'cantrips', zap);
    expect(once).toEqual({ cantrips: [zap], ranked: [] });
    expect(isPicked(once.cantrips, { ...zap })).toBe(true);
    expect(togglePick(once, 'cantrips', { ...zap })).toEqual(none);
  });

  it('keeps the two lists apart', () => {
    expect(togglePick(togglePick(none, 'cantrips', zap), 'ranked', zap)).toEqual({
      cantrips: [zap],
      ranked: [zap],
    });
  });
});

describe('classGifts', () => {
  it('lists the Bard’s cantrip, focus spell and pool, and waits for the muse', () => {
    expect(classGifts('bard', {})).toEqual({
      spells: [
        { slug: 'courageous-anthem', why: 'cantrip' },
        { slug: 'counter-performance', why: 'focus' },
      ],
      focusPoints: 1,
      pending: ['muse'],
      choices: [],
      curriculum: undefined,
      font: undefined,
    });
  });

  it('adds the muse’s spell once the muse is chosen', () => {
    const gifts = classGifts('bard', { muse: 'warrior' });
    expect(gifts.spells).toContainEqual({ slug: 'fear', why: 'choice', choice: 'muse' });
    expect(gifts.pending).toEqual([]);
  });

  it('gives a Cleric its Divine Font: four slots for Heal or Harm, then the one chosen', () => {
    expect(classGifts('cleric', {})).toEqual({
      spells: [],
      focusPoints: 0,
      pending: [],
      choices: [],
      curriculum: undefined,
      font: {
        name: 'Divine Font',
        count: 4,
        spell: undefined,
        options: ['heal', 'harm'],
      },
    });
    expect(classGifts('cleric', { 'divine-font': 'harm' }).font?.spell).toBe('harm');
  });

  it('gives a Druid 1 focus point and waits for the order, then names its order spell', () => {
    expect(classGifts('druid', {})).toMatchObject({
      spells: [],
      focusPoints: 1,
      pending: ['druidicOrder'],
    });
    const chosen = classGifts('druid', { druidicOrder: 'animal-order' });
    expect(chosen.spells).toEqual([{ slug: 'heal-animal', why: 'focus' }]);
    expect(chosen.pending).toEqual([]);
  });

  it('waits for a Witch’s patron, then names its hex cantrip and familiar’s spell', () => {
    expect(classGifts('witch', {})).toMatchObject({
      spells: [],
      focusPoints: 1,
      pending: ['patron'],
    });
    const chosen = classGifts('witch', { patron: 'starless-shadow' });
    expect(chosen.spells).toEqual([
      { slug: 'shroud-of-night', why: 'cantrip' },
      { slug: 'fear', why: 'choice', choice: 'patron' },
    ]);
    expect(chosen.pending).toEqual([]);
  });

  it('offers a Witch its first hex, and lists a chosen one only in the choice', () => {
    expect(classGifts('witch', {}).choices.map((c) => c.key)).toEqual(['first-hex']);
    const chosen = classGifts('witch', {
      patron: 'wilding-steward',
      'first-hex': 'patrons-puppet',
    });
    expect(chosen.choices.map((c) => [c.key, c.chosen])).toEqual([
      ['first-hex', 'patrons-puppet'],
      ['familiar-spell', undefined],
    ]);
    expect(chosen.spells).toEqual([{ slug: 'wilding-word', why: 'cantrip' }]);
  });

  it('waits for a Wizard’s school, then names its school spell and curriculum', () => {
    expect(classGifts('wizard', {})).toMatchObject({
      focusPoints: 1,
      pending: ['arcaneSchool'],
      curriculum: undefined,
    });
    const battle = classGifts('wizard', { arcaneSchool: 'school-of-battle-magic' });
    expect(battle.spells).toEqual([{ slug: 'force-bolt', why: 'focus' }]);
    expect(battle.curriculum).toBe('Curriculum');
    expect(
      classGifts('wizard', { arcaneSchool: 'school-of-unified-magical-theory' })
        .curriculum,
    ).toBeUndefined();
  });

  it('gives a class with no row nothing', () => {
    const none = {
      spells: [],
      focusPoints: 0,
      pending: [],
      choices: [],
      curriculum: undefined,
      font: undefined,
    };
    expect(classGifts('oracle', {})).toEqual(none);
    expect(classGifts(undefined, {})).toEqual(none);
  });
});

describe('choiceWords', () => {
  it.each([
    ['muse', 'muse'],
    ['druidicOrder', 'druidic order'],
    ['divine-font', 'divine font'],
    ['arcaneSchool', 'arcane school'],
  ])('%s reads %s', (key, words) => {
    expect(choiceWords(key)).toBe(words);
  });
});
