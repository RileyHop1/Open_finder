import { describe, expect, it } from 'vitest';

import {
  curriculumBookSpells,
  curriculumFor,
  fontAt,
  grantedSpells,
  spellChoicesFor,
} from './classSpells.js';

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

describe('spellChoicesFor', () => {
  it('offers every Witch a first hex, with the pick once made', () => {
    expect(spellChoicesFor('witch', {}).map((c) => [c.key, c.chosen])).toEqual([
      ['first-hex', undefined],
    ]);
    expect(spellChoicesFor('witch', { 'first-hex': 'phase-familiar' })[0]?.chosen).toBe(
      'phase-familiar',
    );
  });

  it('offers the familiar’s spell only while the patron is Wilding Steward', () => {
    const steward = spellChoicesFor('witch', { patron: 'wilding-steward' });
    expect(steward.map((c) => c.key)).toEqual(['first-hex', 'familiar-spell']);
    expect(steward[1]?.options).toEqual(['summon-animal', 'summon-plant-or-fungus']);
  });

  it('reads a value that is not one of the options as not chosen', () => {
    expect(
      spellChoicesFor('witch', { 'first-hex': 'fireball' })[0]?.chosen,
    ).toBeUndefined();
  });

  it('offers nothing to a class with none', () => {
    expect(spellChoicesFor('bard', {})).toEqual([]);
    expect(spellChoicesFor(undefined, {})).toEqual([]);
  });
});

describe('grantedSpells -- spell choices', () => {
  it('adds a Witch’s first hex to its focus spells and the familiar’s spell to the ranked ones', () => {
    const granted = grantedSpells('witch', {
      patron: 'wilding-steward',
      'first-hex': 'patrons-puppet',
      'familiar-spell': 'summon-animal',
    });
    expect(granted.focusSpells).toEqual(['patrons-puppet']);
    expect(granted.ranked).toEqual(['summon-animal']);
    expect(granted.cantrips).toEqual(['wilding-word']);
  });
});

describe('curriculumFor', () => {
  it('names a Wizard’s curriculum once a school with one is chosen', () => {
    expect(curriculumFor('wizard', { arcaneSchool: 'school-of-battle-magic' })).toBe(
      'Curriculum',
    );
  });

  it('has none before the school is chosen, for Unified Magical Theory, or for another class', () => {
    expect(curriculumFor('wizard', {})).toBeUndefined();
    expect(
      curriculumFor('wizard', { arcaneSchool: 'school-of-unified-magical-theory' }),
    ).toBeUndefined();
    expect(
      curriculumFor('cleric', { arcaneSchool: 'school-of-mentalism' }),
    ).toBeUndefined();
    expect(curriculumFor(undefined, {})).toBeUndefined();
  });
});

describe('curriculumBookSpells', () => {
  it('adds 2 curriculum spells to a school Wizard’s spellbook, and 1 of any kind for Unified Magical Theory', () => {
    expect(
      curriculumBookSpells('wizard', { arcaneSchool: 'school-of-the-boundary' }),
    ).toBe(2);
    expect(
      curriculumBookSpells('wizard', {
        arcaneSchool: 'school-of-unified-magical-theory',
      }),
    ).toBe(1);
  });

  it('adds none before the school is chosen, or for another class', () => {
    expect(curriculumBookSpells('wizard', {})).toBe(0);
    expect(curriculumBookSpells('witch', { patron: 'the-resentment' })).toBe(0);
    expect(curriculumBookSpells(undefined, {})).toBe(0);
  });
});
