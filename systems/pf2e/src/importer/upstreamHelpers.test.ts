import { describe, expect, it } from 'vitest';

import {
  filterValidTraitSlugs,
  mapActionCost,
  nestedNumberField,
  nestedStringArrayField,
  nestedStringField,
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
