import { describe, expect, it } from 'vitest';

import { characterDataSchema, newCharacterData } from './character.js';
import {
  focusPointsSchema,
  spellRankKeySchema,
  spellcastingEntrySchema,
} from './spellcasting.js';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Everything below is invented (ADR 0013).
const prepared = {
  id: ID(1),
  kind: 'prepared',
  name: 'Invented prepared casting',
  tradition: 'arcane',
  attribute: 'int',
};
const spontaneous = {
  id: ID(2),
  kind: 'spontaneous',
  name: 'Invented spontaneous casting',
  tradition: 'occult',
  attribute: 'cha',
};

describe('spellcastingEntrySchema', () => {
  it('accepts a bare prepared entry and fills in the empty state', () => {
    const entry = spellcastingEntrySchema.parse(prepared);
    expect(entry).toMatchObject({
      kind: 'prepared',
      rank: 'trained',
      cantrips: [],
      slots: {},
      prepared: [],
    });
  });

  it('accepts a bare spontaneous entry, with used defaulting to none', () => {
    const entry = spellcastingEntrySchema.parse({
      ...spontaneous,
      slots: { '1': { max: 3 } },
    });
    expect(entry).toMatchObject({
      kind: 'spontaneous',
      repertoire: [],
      signature: [],
      slots: { '1': { max: 3, used: 0 } },
    });
  });

  it('keeps a prepared slot count and the rows chosen for it apart: used is the expended rows', () => {
    const entry = spellcastingEntrySchema.parse({
      ...prepared,
      slots: { '1': 3, '2': 2 },
      prepared: [
        { rank: 1, itemId: ID(10) },
        { rank: 1, itemId: ID(10), expended: true },
      ],
    });
    expect(
      entry.kind === 'prepared' ? entry.prepared.map((p) => p.expended) : [],
    ).toEqual([false, true]);
  });

  it('allows what the rules would call a mistake: more rows than slots, a row of the wrong rank (ADR 0023)', () => {
    const result = spellcastingEntrySchema.safeParse({
      ...prepared,
      slots: { '1': 1 },
      prepared: [
        { rank: 1, itemId: ID(10) },
        { rank: 1, itemId: ID(11) },
        { rank: 5, itemId: ID(12) },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects data that is not a count, a rank or an id', () => {
    expect(
      spellcastingEntrySchema.safeParse({ ...prepared, slots: { '11': 1 } }).success,
    ).toBe(false);
    expect(
      spellcastingEntrySchema.safeParse({ ...prepared, slots: { '0': 1 } }).success,
    ).toBe(false);
    expect(
      spellcastingEntrySchema.safeParse({ ...prepared, slots: { '1': -1 } }).success,
    ).toBe(false);
    expect(
      spellcastingEntrySchema.safeParse({ ...prepared, cantrips: ['not-an-id'] }).success,
    ).toBe(false);
    expect(
      spellcastingEntrySchema.safeParse({ ...prepared, kind: 'innate' }).success,
    ).toBe(false);
    expect(
      spellcastingEntrySchema.safeParse({ ...prepared, tradition: 'psychic' }).success,
    ).toBe(false);
  });
});

describe('spellRankKeySchema', () => {
  it.each(['1', '9', '10'])('accepts %s', (key) => {
    expect(spellRankKeySchema.safeParse(key).success).toBe(true);
  });
  it.each(['0', '11', '01', 'one', ''])('rejects %s', (key) => {
    expect(spellRankKeySchema.safeParse(key).success).toBe(false);
  });
});

describe('focusPointsSchema', () => {
  it('defaults to an empty pool, and does not enforce the rules’ cap of 3', () => {
    expect(focusPointsSchema.parse({})).toEqual({ max: 0, current: 0 });
    expect(focusPointsSchema.safeParse({ max: 5, current: 5 }).success).toBe(true);
  });
});

describe('a character’s spellcasting', () => {
  it('is empty for a new character, with an empty focus pool', () => {
    const data = newCharacterData();
    expect(data.spellcasting).toEqual([]);
    expect(data.focusPoints).toEqual({ max: 0, current: 0 });
  });

  it('parses a character stored before the fields existed (no migration needed)', () => {
    const { spellcasting: _s, focusPoints: _f, ...old } = newCharacterData();
    const parsed = characterDataSchema.parse(old);
    expect(parsed.spellcasting).toEqual([]);
    expect(parsed.focusPoints).toEqual({ max: 0, current: 0 });
  });

  it('round-trips entries and the pool', () => {
    const data = characterDataSchema.parse({
      ...newCharacterData(),
      spellcasting: [prepared, spontaneous],
      focusPoints: { max: 1, current: 1 },
    });
    expect(characterDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(data.spellcasting).toHaveLength(2);
  });

  it('does not let two entries share an id', () => {
    const result = characterDataSchema.safeParse({
      ...newCharacterData(),
      spellcasting: [prepared, { ...spontaneous, id: prepared.id }],
    });
    expect(result.success).toBe(false);
  });
});
