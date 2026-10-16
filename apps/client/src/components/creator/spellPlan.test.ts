import { describe, expect, it } from 'vitest';

import { castingPlan, classGifts, isPicked, togglePick } from './spellPlan.js';

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
    });
  });

  it('adds the muse’s spell once the muse is chosen', () => {
    const gifts = classGifts('bard', { muse: 'warrior' });
    expect(gifts.spells).toContainEqual({ slug: 'fear', why: 'choice', choice: 'muse' });
    expect(gifts.pending).toEqual([]);
  });

  it('gives a class with no row nothing', () => {
    expect(classGifts('cleric', {})).toEqual({ spells: [], focusPoints: 0, pending: [] });
    expect(classGifts(undefined, {})).toEqual({
      spells: [],
      focusPoints: 0,
      pending: [],
    });
  });
});
