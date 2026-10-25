import { describe, expect, it } from 'vitest';

import { classWeaponGroupRanks } from './weaponGroupRanks.js';

describe('classWeaponGroupRanks', () => {
  it('trains an Alchemist in bombs, expert from 7 and master from 15', () => {
    expect(classWeaponGroupRanks('alchemist', 1)).toEqual({ bomb: 'trained' });
    expect(classWeaponGroupRanks('alchemist', 6)).toEqual({ bomb: 'trained' });
    expect(classWeaponGroupRanks('alchemist', 7)).toEqual({ bomb: 'expert' });
    expect(classWeaponGroupRanks('alchemist', 20)).toEqual({ bomb: 'master' });
  });

  it('gives a class with no row, or no class, none', () => {
    expect(classWeaponGroupRanks('fighter', 5)).toEqual({});
    expect(classWeaponGroupRanks(undefined, 5)).toEqual({});
  });
});
