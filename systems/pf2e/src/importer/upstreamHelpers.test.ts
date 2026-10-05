import { describe, expect, it } from 'vitest';

import {
  extractBoostSlots,
  filterValidTraitSlugs,
  mapActionCost,
  mapBulk,
  mapPriceInCopper,
  nestedNumberField,
  nestedStringArrayField,
  nestedStringField,
  parseDieSize,
  slugify,
} from './upstreamHelpers.js';

describe('nestedStringField / nestedNumberField / nestedStringArrayField', () => {
  it('reads a well-formed nested string field', () => {
    expect(
      nestedStringField({ description: { value: 'hi' } }, 'description', 'value'),
    ).toBe('hi');
  });

  it('returns undefined for a missing key, a non-object, or a wrong-typed value', () => {
    expect(nestedStringField({}, 'description', 'value')).toBeUndefined();
    expect(
      nestedStringField({ description: 'not an object' }, 'description', 'value'),
    ).toBeUndefined();
    expect(
      nestedStringField({ description: { value: 5 } }, 'description', 'value'),
    ).toBeUndefined();
  });

  it('reads a well-formed nested number field', () => {
    expect(nestedNumberField({ level: { value: 3 } }, 'level', 'value')).toBe(3);
  });

  it('reads a well-formed nested string array field', () => {
    expect(
      nestedStringArrayField({ traits: { value: ['a', 'b'] } }, 'traits', 'value'),
    ).toEqual(['a', 'b']);
  });

  it('rejects a nested array containing a non-string', () => {
    expect(
      nestedStringArrayField({ traits: { value: ['a', 5] } }, 'traits', 'value'),
    ).toBeUndefined();
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Toughness')).toBe('toughness');
    expect(slugify('Two Weapon Fighting')).toBe('two-weapon-fighting');
  });

  it('strips apostrophes rather than turning them into hyphens', () => {
    expect(slugify("Dragon's Breath")).toBe('dragons-breath');
  });

  it('trims leading and trailing hyphens from punctuation at the edges', () => {
    expect(slugify('(Greater) Toughness!')).toBe('greater-toughness');
  });
});

describe('mapActionCost', () => {
  it('maps a reaction', () => {
    expect(mapActionCost('reaction', undefined)).toBe('reaction');
  });

  it('maps a free action', () => {
    expect(mapActionCost('free', undefined)).toBe('free');
  });

  it.each([
    [1, 'one'],
    [2, 'two'],
    [3, 'three'],
  ] as const)('maps a %i-action activity to %s', (count, expected) => {
    expect(mapActionCost('action', count)).toBe(expected);
  });

  it('returns undefined for a passive action type -- the common case for most feats', () => {
    expect(mapActionCost('passive', undefined)).toBeUndefined();
  });

  it('returns undefined for an unrecognized actions count', () => {
    expect(mapActionCost('action', 4)).toBeUndefined();
  });
});

describe('filterValidTraitSlugs', () => {
  it('keeps only the traits the validator accepts', () => {
    const isValid = (value: string): boolean => value === 'agile';
    expect(filterValidTraitSlugs(['agile', 'not valid'], isValid)).toEqual(['agile']);
  });

  it('returns an empty array when the input is undefined', () => {
    expect(filterValidTraitSlugs(undefined, () => true)).toEqual([]);
  });
});

describe('parseDieSize', () => {
  it.each([
    ['d4', 4],
    ['d6', 6],
    ['d8', 8],
    ['d10', 10],
    ['d12', 12],
  ] as const)('parses %s to %i', (dieSize, expected) => {
    expect(parseDieSize(dieSize)).toBe(expected);
  });

  it('returns undefined for a die size PF2e does not use', () => {
    expect(parseDieSize('d20')).toBeUndefined();
  });

  it('returns undefined for a non-string value', () => {
    expect(parseDieSize(8)).toBeUndefined();
  });
});

describe('extractBoostSlots', () => {
  it("extracts each slot's eligible-attribute array", () => {
    const boosts = {
      '0': { value: ['dex'] },
      '1': { value: ['str', 'con'] },
      '2': { value: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
    };
    expect(extractBoostSlots(boosts)).toEqual([
      ['dex'],
      ['str', 'con'],
      ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    ]);
  });

  it('returns an empty array for a missing or malformed boosts value', () => {
    expect(extractBoostSlots(undefined)).toEqual([]);
    expect(extractBoostSlots(null)).toEqual([]);
    expect(extractBoostSlots('not an object')).toEqual([]);
  });

  it('skips a slot with a malformed value', () => {
    const boosts = { '0': { value: ['dex'] }, '1': { value: 'not an array' } };
    expect(extractBoostSlots(boosts)).toEqual([['dex']]);
  });
});

describe('mapPriceInCopper', () => {
  it('converts a mixed-denomination price to one copper total', () => {
    expect(mapPriceInCopper({ gp: 1, sp: 5 })).toBe(150);
  });

  it('converts each denomination independently', () => {
    expect(mapPriceInCopper({ pp: 1 })).toBe(1000);
    expect(mapPriceInCopper({ gp: 1 })).toBe(100);
    expect(mapPriceInCopper({ sp: 1 })).toBe(10);
    expect(mapPriceInCopper({ cp: 1 })).toBe(1);
  });

  it('treats an all-zero price as 0 copper, not undefined', () => {
    expect(mapPriceInCopper({ gp: 0, sp: 0 })).toBe(0);
  });

  it('returns undefined when every denomination is missing or non-numeric', () => {
    expect(mapPriceInCopper({})).toBeUndefined();
    expect(mapPriceInCopper({ gp: 'free' })).toBeUndefined();
  });

  it('returns undefined for a missing or malformed value', () => {
    expect(mapPriceInCopper(undefined)).toBeUndefined();
    expect(mapPriceInCopper('not an object')).toBeUndefined();
  });
});

describe('mapBulk', () => {
  it('parses a whole-number string', () => {
    expect(mapBulk('2')).toBe(2);
  });

  it('parses "L" as light (0.1)', () => {
    expect(mapBulk('L')).toBe(0.1);
  });

  it('parses "-" as explicitly no Bulk', () => {
    expect(mapBulk('-')).toBe(0);
  });

  it('returns undefined for a missing or unrecognized value', () => {
    expect(mapBulk(undefined)).toBeUndefined();
    expect(mapBulk('heavy')).toBeUndefined();
    expect(mapBulk(2)).toBeUndefined();
  });
});
