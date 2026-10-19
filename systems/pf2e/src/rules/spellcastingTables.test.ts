import { describe, expect, it } from 'vitest';

import {
  CASTER_CLASS_SLUGS,
  CASTER_TABLES,
  isCasterClass,
  rankOpensAt,
  slotsAtLevel,
  traditionFor,
  bookFor,
  repertoireFilled,
} from './spellcastingTables.js';

// Golden values: worked out by hand from the pattern in the module comment, and
// (for levels 1 to 10) matched against the sample characters in the pinned
// upstream pack when this was written. Levels 11 to 20 are the pattern's
// extension and are (confirm).
describe('slotsAtLevel -- standard casters (Cleric, Druid, Witch, Wizard base, Bard)', () => {
  it.each([
    [1, { 1: 2 }],
    [2, { 1: 3 }],
    [3, { 1: 3, 2: 2 }],
    [4, { 1: 3, 2: 3 }],
    [5, { 1: 3, 2: 3, 3: 2 }],
    [6, { 1: 3, 2: 3, 3: 3 }],
    [7, { 1: 3, 2: 3, 3: 3, 4: 2 }],
    [10, { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 }],
    [11, { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2 }],
    [17, { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 2 }],
    [18, { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3 }],
    [19, { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 }],
    [20, { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 }],
  ])('level %i', (level, expected) => {
    expect(slotsAtLevel('standard', level)).toEqual(expected);
  });
});

describe('slotsAtLevel -- the Sorcerer', () => {
  it.each([
    [1, { 1: 3 }],
    [2, { 1: 4 }],
    [3, { 1: 4, 2: 3 }],
    [4, { 1: 4, 2: 4 }],
    [5, { 1: 4, 2: 4, 3: 3 }],
    [10, { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 }],
    [19, { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 1 }],
  ])('level %i', (level, expected) => {
    expect(slotsAtLevel('sorcerer', level)).toEqual(expected);
  });
});

describe('slotsAtLevel -- edges', () => {
  it('clamps a level outside 1 to 20 instead of failing', () => {
    expect(slotsAtLevel('standard', 0)).toEqual(slotsAtLevel('standard', 1));
    expect(slotsAtLevel('standard', 25)).toEqual(slotsAtLevel('standard', 20));
  });

  it('opens a rank at 2r - 1, and the tenth at 19', () => {
    expect([1, 2, 3, 9, 10].map(rankOpensAt)).toEqual([1, 3, 5, 17, 19]);
  });
});

describe('CASTER_TABLES', () => {
  it('covers exactly the seven casters of milestone 8(b)', () => {
    expect([...CASTER_CLASS_SLUGS].sort()).toEqual([
      'bard',
      'cleric',
      'druid',
      'oracle',
      'sorcerer',
      'witch',
      'wizard',
    ]);
    expect(Object.keys(CASTER_TABLES).sort()).toEqual([...CASTER_CLASS_SLUGS].sort());
    expect(isCasterClass('wizard')).toBe(true);
    expect(isCasterClass('fighter')).toBe(false);
  });

  it('says which classes prepare and which are spontaneous', () => {
    expect(
      CASTER_CLASS_SLUGS.filter((c) => CASTER_TABLES[c].kind === 'prepared').sort(),
    ).toEqual(['cleric', 'druid', 'witch', 'wizard']);
    expect(
      CASTER_CLASS_SLUGS.filter((c) => CASTER_TABLES[c].kind === 'spontaneous').sort(),
    ).toEqual(['bard', 'oracle', 'sorcerer']);
  });

  it('fixes the tradition for five classes and leaves two to a choice', () => {
    expect(CASTER_TABLES.wizard.tradition).toBe('arcane');
    expect(CASTER_TABLES.cleric.tradition).toBe('divine');
    expect(CASTER_TABLES.druid.tradition).toBe('primal');
    expect(CASTER_TABLES.bard.tradition).toBe('occult');
    expect(CASTER_TABLES.oracle.tradition).toBe('divine');
    expect(CASTER_TABLES.witch.tradition).toMatchObject({ choice: 'patron' });
    expect(CASTER_TABLES.sorcerer.tradition).toMatchObject({ choice: 'bloodline' });
  });

  it('gives the Sorcerer and the Oracle the larger slot style and every other class the standard one', () => {
    expect(CASTER_TABLES.sorcerer.slots).toBe('sorcerer');
    expect(CASTER_TABLES.oracle.slots).toBe('sorcerer');
    expect(
      CASTER_CLASS_SLUGS.filter((c) => c !== 'sorcerer' && c !== 'oracle').every(
        (c) => CASTER_TABLES[c].slots === 'standard',
      ),
    ).toBe(true);
  });
});

describe('traditionFor', () => {
  it('gives a fixed-tradition class its list whatever the choices', () => {
    expect(traditionFor('cleric', {})).toBe('divine');
    expect(traditionFor('wizard', { patron: 'the-resentment' })).toBe('arcane');
  });

  it.each([
    ['faiths-flamekeeper', 'divine'],
    ['silence-in-snow', 'primal'],
    ['spinner-of-threads', 'occult'],
    ['starless-shadow', 'occult'],
    ['the-inscribed-one', 'arcane'],
    ['the-resentment', 'occult'],
    ['wilding-steward', 'primal'],
  ])('a Witch whose patron is %s casts %s spells', (patron, tradition) => {
    expect(traditionFor('witch', { patron })).toBe(tradition);
  });

  it('decides nothing while the choice is unmade or unknown, or for a non-caster', () => {
    expect(traditionFor('witch', {})).toBeUndefined();
    expect(traditionFor('witch', { patron: 'someone-else' })).toBeUndefined();
    expect(traditionFor('sorcerer', { bloodline: 'imperial' })).toBeUndefined();
    // The Draconic bloodline's tradition is its dragon exemplar's, not mapped yet.
    expect(traditionFor('sorcerer', { bloodline: 'bloodline-draconic' })).toBeUndefined();
    expect(traditionFor('fighter', {})).toBeUndefined();
  });
});

describe('bookFor', () => {
  it('gives the Wizard a spellbook and the Witch a familiar, each 10 cantrips and 5 rank 1 spells', () => {
    expect(bookFor('wizard')).toEqual({ name: 'spellbook', cantrips: 10, ranked: 5 });
    expect(bookFor('witch')).toEqual({ name: 'familiar', cantrips: 10, ranked: 5 });
  });

  it('gives every other class none', () => {
    expect(bookFor('cleric')).toBeUndefined();
    expect(bookFor('bard')).toBeUndefined();
    expect(bookFor('fighter')).toBeUndefined();
    expect(bookFor(undefined)).toBeUndefined();
  });
});

describe('the Sorcerer', () => {
  it.each([
    ['bloodline-aberrant', 'occult'],
    ['bloodline-angelic', 'divine'],
    ['bloodline-demonic', 'divine'],
    ['bloodline-diabolic', 'divine'],
    ['bloodline-elemental', 'primal'],
    ['bloodline-fey', 'primal'],
    ['bloodline-hag', 'occult'],
    ['bloodline-imperial', 'arcane'],
    ['bloodline-undead', 'divine'],
  ])('a %s sorcerer casts %s spells', (bloodline, tradition) => {
    expect(traditionFor('sorcerer', { bloodline })).toBe(tradition);
  });

  it('fills one cantrip and one spell per rank open (to the 9th) with its bloodline’s gifts', () => {
    expect(repertoireFilled('sorcerer', 1)).toEqual({ cantrips: 1, ranked: 1 });
    expect(repertoireFilled('sorcerer', 5)).toEqual({ cantrips: 1, ranked: 3 });
    expect(repertoireFilled('sorcerer', 20)).toEqual({ cantrips: 1, ranked: 9 });
  });

  it('is the only class whose grants fill its repertoire', () => {
    expect(CASTER_CLASS_SLUGS.filter((c) => repertoireFilled(c, 1).cantrips > 0)).toEqual(
      ['sorcerer'],
    );
    expect(repertoireFilled('fighter', 1)).toEqual({ cantrips: 0, ranked: 0 });
  });
});
