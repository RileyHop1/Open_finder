import { describe, expect, it } from 'vitest';

import { newCharacterData } from '../content/character.js';
import type { CharacterData } from '../content/character.js';
import { classResources, dailyCrafting } from './classResources.js';

// Invented characters: only the class and Intelligence matter here.
function character(
  classSlug: string | undefined,
  int: number,
  resources: CharacterData['resources'] = {},
): CharacterData {
  const base = newCharacterData();
  return {
    ...base,
    attributes: { ...base.attributes, int },
    ...(classSlug === undefined
      ? {}
      : {
          class: {
            name: classSlug,
            source: { packId: 'classes', slug: classSlug },
          },
        }),
    resources,
  };
}

describe('classResources', () => {
  it('gives an Alchemist 2 + Int versatile vials, none spent', () => {
    expect(classResources(character('alchemist', 3))).toEqual([
      {
        key: 'versatile-vials',
        name: 'Versatile vials',
        derivedMax: 5,
        max: 5,
        used: 0,
        left: 5,
        over: 0,
        regain: { amount: 2, how: 'for every 10 minutes of exploration' },
      },
    ]);
  });

  it('counts what is spent, past the maximum too, and never below 0 left', () => {
    const [vials] = classResources(
      character('alchemist', 1, { 'versatile-vials': { used: 5 } }),
    );
    expect(vials).toMatchObject({ max: 3, used: 5, left: 0, over: 2 });
  });

  it('takes a hand-set maximum over the derived one', () => {
    const [vials] = classResources(
      character('alchemist', 1, { 'versatile-vials': { used: 1, max: 6 } }),
    );
    expect(vials).toMatchObject({ derivedMax: 3, max: 6, left: 5 });
  });

  it('follows Intelligence at once, never below 0', () => {
    expect(classResources(character('alchemist', -4))[0]?.max).toBe(0);
  });

  it('reads a hand-built Alchemist by its class name', () => {
    const data = { ...newCharacterData(), class: { name: 'Alchemist' } };
    expect(classResources(data).map((r) => r.key)).toEqual(['versatile-vials']);
  });

  it('keeps no pools for another class, or none', () => {
    expect(classResources(character('fighter', 3))).toEqual([]);
    expect(classResources(character(undefined, 3))).toEqual([]);
  });
});

describe('dailyCrafting', () => {
  it('lets an Alchemist make 4 + Int infused items each day', () => {
    expect(dailyCrafting(character('alchemist', 4))).toEqual({
      name: 'Advanced alchemy',
      count: 8,
    });
  });

  it('is nothing for another class', () => {
    expect(dailyCrafting(character('wizard', 4))).toBeUndefined();
  });
});
