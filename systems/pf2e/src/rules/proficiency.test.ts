import { describe, expect, it } from 'vitest';

import { proficiencyModifier } from './proficiency.js';

describe('proficiencyModifier -- value by rank and level', () => {
  it.each([
    ['untrained', 1, 0],
    ['untrained', 20, 0],
    ['trained', 1, 3],
    ['trained', 20, 22],
    ['expert', 1, 5],
    ['expert', 20, 24],
    ['master', 1, 7],
    ['master', 20, 26],
    ['legendary', 1, 9],
    ['legendary', 20, 28],
  ] as const)('%s at level %d has value %d', (rank, level, expected) => {
    expect(proficiencyModifier(rank, level).value).toBe(expected);
  });
});

describe('proficiencyModifier -- the Remaster-default ruling', () => {
  it('untrained never scales with level, even at level 20', () => {
    expect(proficiencyModifier('untrained', 1).value).toBe(0);
    expect(proficiencyModifier('untrained', 20).value).toBe(0);
  });

  it('trained and above add level on top of the rank bonus', () => {
    expect(proficiencyModifier('trained', 5).value).toBe(5 + 2);
    expect(proficiencyModifier('master', 12).value).toBe(12 + 6);
  });
});

describe('proficiencyModifier -- shape', () => {
  it('is always type "proficiency"', () => {
    expect(proficiencyModifier('trained', 1).type).toBe('proficiency');
  });

  it('is always enabled, with no predicate', () => {
    const modifier = proficiencyModifier('expert', 5);
    expect(modifier.enabled).toBe(true);
    expect(modifier.predicate).toBeUndefined();
  });

  it('labels the modifier with the rank name', () => {
    expect(proficiencyModifier('legendary', 20).label).toBe('Legendary');
    expect(proficiencyModifier('untrained', 1).label).toBe('Untrained');
  });
});
