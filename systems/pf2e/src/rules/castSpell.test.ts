import { describe, expect, it } from 'vitest';

import type { SpellcastingEntry } from '../content/spellcasting.js';
import { cantripRank, refocus, restEntry, spendFocus, spendSlot } from './castSpell.js';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const prepared: SpellcastingEntry = {
  id: ID(1),
  kind: 'prepared',
  name: 'Invented prepared',
  tradition: 'arcane',
  attribute: 'int',
  rank: 'trained',
  cantrips: [],
  slots: { '1': 3 },
  prepared: [
    { rank: 1, itemId: ID(10), expended: false },
    { rank: 1, itemId: ID(10), expended: false },
    { rank: 1, itemId: ID(11), expended: false },
  ],
};

const spontaneous: SpellcastingEntry = {
  id: ID(2),
  kind: 'spontaneous',
  name: 'Invented spontaneous',
  tradition: 'occult',
  attribute: 'cha',
  rank: 'trained',
  cantrips: [],
  slots: { '1': { max: 2, used: 0 } },
  repertoire: [ID(20)],
  signature: [],
};

describe('cantripRank', () => {
  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [9, 5],
    [19, 10],
    [20, 10],
  ])('a level %i caster’s cantrips are rank %i', (level, rank) => {
    expect(cantripRank(level)).toBe(rank);
  });
});

describe('spendSlot -- prepared', () => {
  it('marks one prepared copy of the spell as cast, the first not yet cast', () => {
    const once = spendSlot(prepared, ID(10), 1);
    expect(once.overspent).toBe(false);
    expect(
      once.value.kind === 'prepared' ? once.value.prepared.map((p) => p.expended) : [],
    ).toEqual([true, false, false]);

    const twice = spendSlot(once.value, ID(10), 1);
    expect(
      twice.value.kind === 'prepared' ? twice.value.prepared.map((p) => p.expended) : [],
    ).toEqual([true, true, false]);
    expect(twice.overspent).toBe(false);
  });

  it('is overspent, and changes nothing, when the spell is not prepared or is all cast', () => {
    const notPrepared = spendSlot(prepared, ID(99), 1);
    expect(notPrepared).toEqual({ value: prepared, overspent: true });

    const spent = spendSlot(spendSlot(prepared, ID(11), 1).value, ID(11), 1);
    expect(spent.overspent).toBe(true);
    expect(spendSlot(prepared, ID(10), 2).overspent).toBe(true);
  });
});

describe('spendSlot -- spontaneous', () => {
  it('counts a slot used', () => {
    const result = spendSlot(spontaneous, ID(20), 1);
    expect(result.overspent).toBe(false);
    expect(
      result.value.kind === 'spontaneous' ? result.value.slots['1'] : undefined,
    ).toEqual({
      max: 2,
      used: 1,
    });
  });

  it('counts past the maximum so it reads -1 slot, and says it was overspent (ADR 0023)', () => {
    const twice = spendSlot(spendSlot(spontaneous, ID(20), 1).value, ID(20), 1);
    expect(twice.overspent).toBe(false);
    const third = spendSlot(twice.value, ID(20), 1);
    expect(third.overspent).toBe(true);
    expect(
      third.value.kind === 'spontaneous' ? third.value.slots['1'] : undefined,
    ).toEqual({
      max: 2,
      used: 3,
    });
  });

  it('casting at a rank with no slots is overspent and starts a count', () => {
    const result = spendSlot(spontaneous, ID(20), 4);
    expect(result.overspent).toBe(true);
    expect(
      result.value.kind === 'spontaneous' ? result.value.slots['4'] : undefined,
    ).toEqual({
      max: 0,
      used: 1,
    });
  });
});

describe('focus points', () => {
  it('spends one, and at zero changes nothing and is overspent', () => {
    expect(spendFocus({ max: 2, current: 2 })).toEqual({
      value: { max: 2, current: 1 },
      overspent: false,
    });
    expect(spendFocus({ max: 2, current: 0 })).toEqual({
      value: { max: 2, current: 0 },
      overspent: true,
    });
  });

  it('refocus regains one, up to the maximum', () => {
    expect(refocus({ max: 2, current: 0 })).toEqual({ max: 2, current: 1 });
    expect(refocus({ max: 2, current: 2 })).toEqual({ max: 2, current: 2 });
    expect(refocus({ max: 0, current: 0 })).toEqual({ max: 0, current: 0 });
  });
});

describe('restEntry', () => {
  it('frees every spontaneous slot and keeps the maximums and the repertoire', () => {
    const used: SpellcastingEntry = {
      ...spontaneous,
      slots: { '1': { max: 2, used: 3 }, '2': { max: 1, used: 1 } },
    };
    const rested = restEntry(used);
    expect(rested.kind === 'spontaneous' ? rested.slots : {}).toEqual({
      '1': { max: 2, used: 0 },
      '2': { max: 1, used: 0 },
    });
    expect(rested.kind === 'spontaneous' ? rested.repertoire : []).toEqual([ID(20)]);
  });

  it('un-casts prepared spells without un-preparing them', () => {
    const cast = spendSlot(prepared, ID(10), 1).value;
    const rested = restEntry(cast);
    expect(
      rested.kind === 'prepared'
        ? rested.prepared.map((p) => [p.itemId, p.expended])
        : [],
    ).toEqual([
      [ID(10), false],
      [ID(10), false],
      [ID(11), false],
    ]);
  });
});
