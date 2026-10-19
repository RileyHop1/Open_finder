import type { ClassFeatureEntry } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import {
  castingPlan,
  choiceWords,
  classGifts,
  curriculumSpells,
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
      preparedCantrips: undefined,
      known: 2,
      book: undefined,
      rankedLabel: 'Rank 1 spells you know',
    });
    // A Sorcerer's bloodline fills one cantrip and one rank 1 spell of its 5 and 3.
    expect(castingPlan('sorcerer')).toMatchObject({ cantrips: 4, known: 2 });
    expect(castingPlan('oracle')?.known).toBe(3);
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

  it('counts a book caster’s picks against its book, with 5 cantrips prepared to start', () => {
    expect(castingPlan('wizard')).toMatchObject({
      cantrips: 10,
      preparedCantrips: 5,
      known: 5,
      book: { name: 'spellbook' },
    });
    expect(castingPlan('witch')).toMatchObject({
      cantrips: 10,
      preparedCantrips: 5,
      known: 5,
      rankedLabel: 'Rank 1 spells your familiar knows',
    });
    expect(castingPlan('cleric')).toMatchObject({
      cantrips: 5,
      preparedCantrips: undefined,
    });
  });

  it('counts a school Wizard’s 2 curriculum spells in its spellbook, and Unified Magical Theory’s 1', () => {
    expect(castingPlan('wizard', { arcaneSchool: 'school-of-mentalism' })?.known).toBe(7);
    expect(
      castingPlan('wizard', { arcaneSchool: 'school-of-unified-magical-theory' })?.known,
    ).toBe(6);
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

  it('waits for an Oracle’s mystery, then names its granted cantrip and spell and its revelation spell', () => {
    expect(classGifts('oracle', {})).toMatchObject({
      spells: [],
      focusPoints: 1,
      pending: ['mystery'],
    });
    expect(classGifts('oracle', { mystery: 'tempest' }).spells).toEqual([
      { slug: 'electric-arc', why: 'cantrip' },
      { slug: 'tempest-touch', why: 'focus' },
      { slug: 'thunderstrike', why: 'choice', choice: 'mystery' },
    ]);
  });

  it('waits for a Sorcerer’s bloodline, then names its gifts and bloodline spell', () => {
    expect(classGifts('sorcerer', {})).toMatchObject({
      focusPoints: 1,
      pending: ['bloodline'],
    });
    expect(classGifts('sorcerer', { bloodline: 'bloodline-undead' }).spells).toEqual([
      { slug: 'void-warp', why: 'cantrip' },
      { slug: 'undeaths-blessing', why: 'focus' },
      { slug: 'harm', why: 'choice', choice: 'bloodline' },
    ]);
  });

  it('waits for an Elemental sorcerer’s element only once that bloodline is chosen', () => {
    expect(classGifts('sorcerer', { bloodline: 'bloodline-elemental' }).pending).toEqual([
      'elemental-influence',
    ]);
    expect(
      classGifts('sorcerer', {
        bloodline: 'bloodline-elemental',
        'elemental-influence': 'metal',
      }).spells,
    ).toEqual([
      { slug: 'electric-arc', why: 'cantrip' },
      { slug: 'elemental-toss', why: 'focus' },
      { slug: 'thunderstrike', why: 'choice', choice: 'elemental-influence' },
    ]);
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
    expect(classGifts('fighter', {})).toEqual(none);
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

describe('curriculumSpells', () => {
  // An invented school feature: only the fields the helper reads.
  const school = {
    slug: 'school-of-mentalism',
    curriculum: { '0': ['glow-spark', 'dust-mote'], '1': ['ember-gate', 'long-echo'] },
  } as unknown as ClassFeatureEntry;

  it('reads the chosen school’s cantrips and rank 1 spells, and how many go in the spellbook', () => {
    expect(
      curriculumSpells('wizard', { arcaneSchool: 'school-of-mentalism' }, [school]),
    ).toEqual({
      cantrips: ['glow-spark', 'dust-mote'],
      ranked: ['ember-gate', 'long-echo'],
      bookSpells: 2,
    });
  });

  it('has none before the school is chosen, without its feature, or for a school without one', () => {
    expect(curriculumSpells('wizard', {}, [school])).toBeUndefined();
    expect(
      curriculumSpells('wizard', { arcaneSchool: 'school-of-mentalism' }, undefined),
    ).toBeUndefined();
    expect(
      curriculumSpells('wizard', { arcaneSchool: 'school-of-unified-magical-theory' }, [
        school,
      ]),
    ).toBeUndefined();
  });
});
