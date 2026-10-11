import type { AncestryEntry, BackgroundEntry, ClassEntry } from '@hearthtable/pf2e';
import { applyBoosts } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import {
  boostSections,
  composeBoosts,
  keyBoost,
  remaining,
  sectionNotes,
} from './boostPlan.js';

// Everything below is invented (ADR 0013).
const ancestry = {
  name: 'Invented Folk',
  boosts: ['str', 'con'],
  freeBoosts: 1,
  flaws: [],
} as unknown as AncestryEntry;
const background = {
  name: 'Invented Trade',
  boostOptions: ['str', 'dex'],
} as unknown as BackgroundEntry;
const cls = {
  name: 'Invented Vanguard',
  keyAttributeOptions: ['str', 'dex'],
} as unknown as ClassEntry;
const entries = { ancestry, background, class: cls };

describe('boostSections', () => {
  it('lists a section per source the entries give, and always the free boosts', () => {
    expect(boostSections({}, {}).map((s) => s.id)).toEqual(['free']);
    expect(boostSections(entries, {}).map((s) => [s.id, s.count])).toEqual([
      ['ancestry', 1],
      ['background-choice', 1],
      ['background-free', 1],
      ['free', 4],
    ]);
  });

  it('offers the background’s boost only the attributes it names', () => {
    const choice = boostSections(entries, {}).find((s) => s.id === 'background-choice');
    expect(choice?.options).toEqual(['str', 'dex']);
  });
});

describe('composeBoosts', () => {
  it('adds the fixed boosts, the picks and the key attribute, at level 1', () => {
    const { boosts, flaws } = composeBoosts(
      entries,
      {
        ancestry: ['dex'],
        'background-choice': ['str'],
        'background-free': ['wis'],
        free: ['str', 'cha', 'con', 'int'],
      },
      undefined,
    );
    expect(flaws).toEqual([]);
    expect(boosts).toEqual([
      { level: 1, source: 'ancestry', attributes: ['str', 'con', 'dex'] },
      { level: 1, source: 'background', attributes: ['str'] },
      { level: 1, source: 'background', attributes: ['wis'] },
      { level: 1, source: 'free', attributes: ['str', 'cha', 'con', 'int'] },
      { level: 1, source: 'class', attributes: ['str'] },
    ]);
  });

  it('produces the modifiers worked out by hand, with a boost past +4 only partial', () => {
    // str: ancestry, background, free, class = +4. con: ancestry, free = +2.
    // dex: ancestry = +1. wis, cha, int: +1 each.
    const { boosts, flaws } = composeBoosts(
      entries,
      {
        ancestry: ['dex'],
        'background-choice': ['str'],
        'background-free': ['wis'],
        free: ['str', 'cha', 'con', 'int'],
      },
      undefined,
    );
    const result = applyBoosts(boosts, flaws, 1);
    expect(result.attributes).toEqual({ str: 4, dex: 1, con: 2, int: 1, wis: 1, cha: 1 });
    expect(result.partial.str).toBe(false);

    // One more on strength is only a partial boost.
    const more = composeBoosts(
      entries,
      { free: ['str'], 'background-choice': ['str'] },
      'str',
    );
    const sixth = applyBoosts(
      [...more.boosts, { level: 1, source: 'free', attributes: ['str'] }],
      [],
      1,
    );
    expect(sixth.attributes.str).toBe(4);
    expect(sixth.partial.str).toBe(true);
  });

  it('follows the key attribute the player chose, else the class’s first option', () => {
    expect(keyBoost(cls, undefined)).toBe('str');
    expect(keyBoost(cls, 'dex')).toBe('dex');
    expect(keyBoost(undefined, 'dex')).toBeUndefined();
    const { boosts } = composeBoosts({ class: cls }, {}, 'dex');
    expect(boosts).toEqual([{ level: 1, source: 'class', attributes: ['dex'] }]);
  });

  it('carries the ancestry’s flaws', () => {
    const flawed = { ...ancestry, flaws: ['cha'] } as unknown as AncestryEntry;
    expect(composeBoosts({ ancestry: flawed }, {}, undefined).flaws).toEqual(['cha']);
  });
});

describe('sectionNotes and remaining', () => {
  const section = (picked: string[]) =>
    ({
      id: 'background-choice',
      label: 'x',
      fixed: [],
      count: 1,
      options: ['str', 'dex'],
      picked,
    }) as unknown as Parameters<typeof sectionNotes>[0];

  it('is quiet when the section is as the rules ask', () => {
    expect(sectionNotes(section(['str']))).toEqual([]);
    expect(remaining(section([]))).toBe(1);
    expect(remaining(section(['str']))).toBe(0);
  });

  it('says what is off, and never counts below zero', () => {
    expect(sectionNotes(section(['str', 'dex']))).toEqual([
      '2 chosen but only 1 allowed. All are applied.',
    ]);
    expect(sectionNotes(section(['wis']))).toEqual([
      'Wisdom is not one of the options offered here.',
    ]);
    expect(remaining(section(['str', 'dex']))).toBe(0);
  });
});
