import { describe, expect, it } from 'vitest';

import {
  ADVANCEMENT_BOOST_LEVELS,
  STANDARD_ADVANCEMENT,
  advancementFor,
  boostLevelsUpTo,
  featSlotsUpTo,
  skillIncreasesUpTo,
} from './progression.js';

describe('standard advancement', () => {
  it('opens the documented slots at level 1', () => {
    expect(featSlotsUpTo(1)).toEqual([
      { slot: 'ancestry', level: 1 },
      { slot: 'class', level: 1 },
    ]);
  });

  it('adds a skill and a class feat at level 2, and a general feat and skill increase at 3', () => {
    expect(featSlotsUpTo(2).slice(2)).toEqual([
      { slot: 'class', level: 2 },
      { slot: 'skill', level: 2 },
    ]);
    expect(featSlotsUpTo(3).slice(4)).toEqual([{ slot: 'general', level: 3 }]);
    expect(skillIncreasesUpTo(2)).toEqual([]);
    expect(skillIncreasesUpTo(3)).toEqual([3]);
  });

  it('counts every slot by level 20', () => {
    const slots = featSlotsUpTo(20);
    expect(slots.filter((s) => s.slot === 'ancestry')).toHaveLength(5);
    expect(slots.filter((s) => s.slot === 'class')).toHaveLength(11);
    expect(slots.filter((s) => s.slot === 'skill')).toHaveLength(10);
    expect(slots.filter((s) => s.slot === 'general')).toHaveLength(5);
    expect(skillIncreasesUpTo(20)).toHaveLength(9);
  });

  it('grants boosts at 5, 10, 15 and 20', () => {
    expect(ADVANCEMENT_BOOST_LEVELS).toEqual([5, 10, 15, 20]);
    expect(boostLevelsUpTo(4)).toEqual([]);
    expect(boostLevelsUpTo(10)).toEqual([5, 10]);
  });
});

describe('a class’s own levels', () => {
  const custom = {
    ...STANDARD_ADVANCEMENT,
    ancestryFeatLevels: [1, 3],
    skillIncreaseLevels: [2, 4],
  };

  it('win over the standard ones', () => {
    expect(advancementFor(custom)).toBe(custom);
    expect(advancementFor()).toBe(STANDARD_ADVANCEMENT);
    expect(featSlotsUpTo(3, custom).filter((s) => s.slot === 'ancestry')).toEqual([
      { slot: 'ancestry', level: 1 },
      { slot: 'ancestry', level: 3 },
    ]);
    expect(skillIncreasesUpTo(3, custom)).toEqual([2]);
  });
});
