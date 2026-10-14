import { describe, expect, it } from 'vitest';

import { deriveCharacter } from '../rules/deriveCharacter.js';

import type { ClassEntry } from '../content/class.js';
import type { CharacterBuild } from '../content/characterBuild.js';
import type { Attribute } from '../content/common.js';

/**
 * The spellcasting each of the seven casters is built with, through the real
 * `deriveCharacter` (CLAUDE.md: one character of each class). The expected values
 * are worked out by hand from the tables in `rules/spellcastingTables.ts`, which are
 * (confirm) -- see `docs/rulings.md` ("Spell slots per rank, by level"). A tradition
 * that depends on a choice (the Witch, the Sorcerer) gives no entry yet.
 *
 * The class entries are stubs with only the fields the derivation reads: nothing
 * here is Paizo content.
 */

const emptyBuild: CharacterBuild = {
  flaws: [],
  boosts: [],
  trainedSkills: [],
  skillIncreases: [],
  feats: [],
  languages: [],
  classChoices: {},
};

const classStub = (slug: string, key: Attribute): ClassEntry =>
  ({
    slug,
    name: slug.slice(0, 1).toUpperCase() + slug.slice(1),
    keyAttributeOptions: [key],
    hpPerLevel: 8,
    proficiencies: undefined,
    skills: { trainedSkillCount: 2, automaticallyTrained: [] },
  }) as unknown as ClassEntry;

const casting = (slug: string, key: Attribute, level: number) =>
  deriveCharacter({
    build: emptyBuild,
    level,
    class: classStub(slug, key),
    resolve: () => undefined,
  });

describe('level 1 casters', () => {
  it.each([
    ['bard', 'cha', 'spontaneous', 'occult', { 1: 2 }],
    ['cleric', 'wis', 'prepared', 'divine', { 1: 2 }],
    ['druid', 'wis', 'prepared', 'primal', { 1: 2 }],
    ['oracle', 'cha', 'spontaneous', 'divine', { 1: 2 }],
    ['wizard', 'int', 'prepared', 'arcane', { 1: 2 }],
  ] as const)('%s', (slug, key, kind, tradition, slots) => {
    const derived = casting(slug, key, 1);
    expect(derived.spellcasting).toMatchObject({
      source: `class:${slug}`,
      kind,
      tradition,
      attribute: key,
      rank: 'trained',
      slots,
      cantrips: 5,
    });
    expect(derived.warnings).toEqual([]);
  });

  it.each([
    ['sorcerer', 'cha', 'bloodline'],
    ['witch', 'int', 'patron'],
  ] as const)('%s waits for its %s', (slug, key, choice) => {
    const derived = casting(slug, key, 1);
    expect(derived.spellcasting).toBeUndefined();
    expect(derived.warnings).toContainEqual({
      kind: 'spellcasting-tradition-undecided',
      choice,
      classSlug: slug,
    });
  });
});

describe('a caster levelling up', () => {
  it('a level 5 cleric has three ranks and is still trained', () => {
    const derived = casting('cleric', 'wis', 5).spellcasting;
    expect(derived?.slots).toEqual({ 1: 3, 2: 3, 3: 2 });
    expect(derived?.rank).toBe('trained');
  });

  it('a level 15 bard has eight ranks and is a master', () => {
    const derived = casting('bard', 'cha', 15).spellcasting;
    expect(derived?.slots).toEqual({ 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2 });
    expect(derived?.rank).toBe('master');
  });
});

describe('non-casters', () => {
  it.each(['fighter', 'rogue', 'monk', 'champion', 'alchemist'])(
    '%s has none',
    (slug) => {
      expect(casting(slug, 'str', 5).spellcasting).toBeUndefined();
    },
  );
});
