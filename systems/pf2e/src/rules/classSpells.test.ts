import { describe, expect, it } from 'vitest';

import { fontAt, grantedSpells } from './classSpells.js';

describe('grantedSpells', () => {
  it('gives a Bard its composition spells and focus pool, and its muse’s spell once chosen', () => {
    expect(grantedSpells('bard', {})).toEqual({
      focusPoints: 1,
      cantrips: ['courageous-anthem'],
      focusSpells: ['counter-performance'],
      ranked: [],
    });
    expect(grantedSpells('bard', { muse: 'maestro' }).ranked).toEqual(['soothe']);
  });

  it('gives a Druid a focus pool of 1 and its order’s spell once the order is chosen', () => {
    expect(grantedSpells('druid', {})).toEqual({
      focusPoints: 1,
      cantrips: [],
      focusSpells: [],
      ranked: [],
    });
    expect(grantedSpells('druid', { druidicOrder: 'storm-order' }).focusSpells).toEqual([
      'tempest-surge',
    ]);
  });

  it('adds nothing for a choice value it does not know', () => {
    expect(grantedSpells('bard', { muse: 'invented-muse' }).ranked).toEqual([]);
  });

  it('grants nothing to a class with no row, or no class', () => {
    const none = { focusPoints: 0, cantrips: [], focusSpells: [], ranked: [] };
    expect(grantedSpells('fighter', {})).toEqual(none);
    expect(grantedSpells(undefined, { muse: 'enigma' })).toEqual(none);
  });
});

describe('fontAt', () => {
  it('gives a Cleric 4 font slots, 5 from level 5 and 6 from level 15', () => {
    expect(
      [1, 4, 5, 14, 15, 20].map((level) => fontAt('cleric', {}, level)?.count),
    ).toEqual([4, 4, 5, 5, 6, 6]);
  });

  it('holds the spell the font choice names, or none until it is made', () => {
    expect(fontAt('cleric', {}, 1)).toEqual({
      name: 'Divine Font',
      spell: undefined,
      count: 4,
    });
    expect(fontAt('cleric', { 'divine-font': 'heal' }, 1)?.spell).toBe('heal');
    expect(fontAt('cleric', { 'divine-font': 'harm' }, 1)?.spell).toBe('harm');
  });

  it('is absent for a class with no font', () => {
    expect(fontAt('bard', {}, 1)).toBeUndefined();
    expect(fontAt(undefined, {}, 1)).toBeUndefined();
  });
});
