import { describe, expect, it } from 'vitest';

import { deriveCharacter } from '../rules/deriveCharacter.js';

import type { ClassEntry, ClassFeatureEntry } from '../content/class.js';
import type { CharacterBuild } from '../content/characterBuild.js';
import type { Attribute } from '../content/common.js';
import type { CharacterItem } from '../content/character.js';

type ItemEntry = CharacterItem['entry'];

/**
 * The spellcasting each of the seven casters is built with, through the real
 * `deriveCharacter` (CLAUDE.md: one character of each class). The expected values
 * are worked out by hand from the tables in `rules/spellcastingTables.ts`, which are
 * (confirm) -- see `docs/rulings.md` ("Spell slots per rank, by level"). A tradition
 * that depends on a choice (the Witch, the Sorcerer) gives no entry until it is made.
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
  spells: { cantrips: [], ranked: [] },
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

/** Any spell the derivation asks for, as an invented stub: the grant table names spells by slug. */
const spellStub = (packId: string, slug: string) =>
  packId === 'spells'
    ? ({
        packId,
        slug,
        name: slug,
        kind: 'spell',
        traits: [],
        ruleElements: [],
        rank: 1,
        traditions: [],
      } as unknown as ItemEntry)
    : undefined;

/** An invented class feature that raises ranks from its level on, the way upstream's Expert Spellcaster does. */
const rankUp = (
  slug: string,
  classSlug: string,
  level: number,
  rankUps: ClassFeatureEntry['rankUps'],
  tags: string[] = [],
): ClassFeatureEntry =>
  ({
    packId: 'class-features',
    slug,
    name: slug,
    kind: 'classFeature',
    traits: [],
    ruleElements: [],
    classSlugs: [classSlug],
    level,
    tags,
    rankUps,
    skillRankUps: {},
  }) as unknown as ClassFeatureEntry;

const casting = (
  slug: string,
  key: Attribute,
  level: number,
  classChoices: Record<string, string> = {},
  classFeatures: ClassFeatureEntry[] = [],
) =>
  deriveCharacter({
    build: { ...emptyBuild, classChoices },
    level,
    class: classStub(slug, key),
    classFeatures,
    resolve: spellStub,
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

describe('what a class grants by itself', () => {
  it('a level 1 Enigma bard: a composition cantrip, a focus spell, the muse’s spell, 1 focus point', () => {
    const derived = casting('bard', 'cha', 1, { muse: 'enigma' });
    expect(derived.focusPoints).toBe(1);
    expect(derived.spellPicks.cantrips.map((r) => r.slug)).toEqual(['courageous-anthem']);
    expect(derived.spellPicks.ranked.map((r) => r.slug)).toEqual(['sure-strike']);
    expect(derived.items.map((i) => i.slug)).toEqual([
      'counter-performance',
      'courageous-anthem',
      'sure-strike',
    ]);
  });

  it.each([
    ['maestro', 'soothe'],
    ['polymath', 'phantasmal-minion'],
    ['warrior', 'fear'],
  ])('a %s bard learns %s', (muse, spell) => {
    expect(
      casting('bard', 'cha', 1, { muse }).spellPicks.ranked.map((r) => r.slug),
    ).toEqual([spell]);
  });

  it.each([
    ['animal-order', 'heal-animal'],
    ['leaf-order', 'cornucopia'],
    ['storm-order', 'tempest-surge'],
    ['untamed-order', 'untamed-shift'],
  ])('a level 1 Druid of the %s: its order spell and 1 focus point', (order, spell) => {
    const derived = casting('druid', 'wis', 1, { druidicOrder: order });
    expect(derived.focusPoints).toBe(1);
    expect(derived.items.map((i) => i.slug)).toContain(spell);
    // An order spell is a focus spell: not a cantrip, not one to prepare.
    expect(derived.spellPicks).toEqual({ cantrips: [], ranked: [] });
  });

  it.each([
    ['faiths-flamekeeper', 'divine', 'stoke-the-heart', 'command'],
    ['spinner-of-threads', 'occult', 'nudge-fate', 'sure-strike'],
    ['the-inscribed-one', 'arcane', 'discern-secrets', 'runic-weapon'],
    ['silence-in-snow', 'primal', 'clinging-ice', 'gust-of-wind'],
  ])(
    'a level 1 Witch of %s: %s spells, its hex cantrip and familiar’s spell, 1 focus point',
    (patron, tradition, hex, spell) => {
      const derived = casting('witch', 'int', 1, {
        patron,
        'first-hex': 'phase-familiar',
      });
      expect(derived.spellcasting).toMatchObject({
        kind: 'prepared',
        tradition,
        slots: { 1: 2 },
        cantrips: 5,
      });
      expect(derived.warnings).toEqual([]);
      expect(derived.focusPoints).toBe(1);
      expect(derived.items.map((i) => i.slug)).toContain('phase-familiar');
      expect(derived.spellPicks).toEqual({
        cantrips: [{ packId: 'spells', slug: hex }],
        ranked: [{ packId: 'spells', slug: spell }],
      });
    },
  );

  it('a Witch with no first hex chosen gets none, and a warning that Hex Spells asks for one', () => {
    const derived = casting('witch', 'int', 1, { patron: 'the-resentment' });
    expect(derived.items.map((i) => i.slug)).not.toContain('patrons-puppet');
    expect(derived.items.map((i) => i.slug)).not.toContain('phase-familiar');
    expect(derived.warnings).toEqual([
      { kind: 'choice-not-made', choice: 'first-hex', feature: 'hex-spells' },
    ]);
  });

  it('a Wilding Steward witch’s familiar learns the summon spell picked for it', () => {
    const derived = casting('witch', 'int', 1, {
      patron: 'wilding-steward',
      'first-hex': 'patrons-puppet',
      'familiar-spell': 'summon-plant-or-fungus',
    });
    expect(derived.spellcasting?.tradition).toBe('primal');
    expect(derived.spellPicks).toEqual({
      cantrips: [{ packId: 'spells', slug: 'wilding-word' }],
      ranked: [{ packId: 'spells', slug: 'summon-plant-or-fungus' }],
    });
    expect(derived.warnings).toEqual([]);
  });

  it('asks a Wilding Steward witch for the familiar’s spell, and no other patron', () => {
    const steward = casting('witch', 'int', 1, {
      patron: 'wilding-steward',
      'first-hex': 'patrons-puppet',
    });
    expect(steward.warnings).toEqual([
      { kind: 'choice-not-made', choice: 'familiar-spell', feature: 'wilding-steward' },
    ]);
    // A familiar spell left over from another patron is not applied.
    const other = casting('witch', 'int', 1, {
      patron: 'starless-shadow',
      'first-hex': 'patrons-puppet',
      'familiar-spell': 'summon-animal',
    });
    expect(other.spellPicks.ranked).toEqual([{ packId: 'spells', slug: 'fear' }]);
    expect(other.warnings).toEqual([]);
  });

  it('the other casters grant nothing yet', () => {
    for (const [slug, key] of [
      ['cleric', 'wis'],
      ['oracle', 'cha'],
      ['wizard', 'int'],
    ] as const) {
      const derived = casting(slug, key, 1);
      expect(derived.focusPoints).toBe(0);
      expect(derived.spellPicks).toEqual({ cantrips: [], ranked: [] });
    }
  });
});

describe('a Cleric’s Divine Font', () => {
  it.each([
    [1, 'heal', 1, 4],
    [5, 'harm', 3, 5],
    [15, 'heal', 8, 6],
  ] as const)('at level %i (%s): rank %i, %i slots', (level, choice, rank, count) => {
    const derived = casting('cleric', 'wis', level, { 'divine-font': choice });
    expect(derived.font).toMatchObject({
      spellcasting: {
        source: 'class:cleric:font',
        name: 'Divine Font',
        kind: 'prepared',
        tradition: 'divine',
        slots: { [rank]: count },
        cantrips: 0,
      },
      spell: { packId: 'spells', slug: choice },
      rank,
      count,
    });
  });

  it('has its slots but no spell before the font is chosen, and no other caster has one', () => {
    expect(casting('cleric', 'wis', 1).font).toMatchObject({
      spell: undefined,
      count: 4,
    });
    expect(casting('bard', 'cha', 1).font).toBeUndefined();
    expect(casting('wizard', 'int', 1).font).toBeUndefined();
  });
});

describe('a caster levelling up', () => {
  it('a level 5 cleric has three ranks and is still trained', () => {
    const derived = casting('cleric', 'wis', 5).spellcasting;
    expect(derived?.slots).toEqual({ 1: 3, 2: 3, 3: 2 });
    expect(derived?.rank).toBe('trained');
  });

  // The spellcasting rank comes from the class features' rank-ups, not the level.
  const spellcasterFeatures = (classSlug: string) => [
    rankUp('expert-spellcaster', classSlug, 7, { spellcasting: 'expert' }),
    rankUp('master-spellcaster', classSlug, 15, { spellcasting: 'master' }),
    rankUp('legendary-spellcaster', classSlug, 19, { spellcasting: 'legendary' }),
  ];

  it('a level 15 bard has eight ranks and is a master', () => {
    const derived = casting(
      'bard',
      'cha',
      15,
      {},
      spellcasterFeatures('bard'),
    ).spellcasting;
    expect(derived?.slots).toEqual({ 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2 });
    expect(derived?.rank).toBe('master');
  });

  it.each([
    [6, 'trained'],
    [7, 'expert'],
    [14, 'expert'],
    [15, 'master'],
    [19, 'legendary'],
  ] as const)('a level %i wizard is %s', (level, rank) => {
    expect(
      casting('wizard', 'int', level, {}, spellcasterFeatures('wizard')).spellcasting
        ?.rank,
    ).toBe(rank);
  });

  it('is trained at any level when no class feature raises it', () => {
    expect(casting('bard', 'cha', 15).spellcasting?.rank).toBe('trained');
  });
});

describe('a Cleric’s doctrine sets its ranks', () => {
  // Invented stand-ins for the two doctrines and their benefits, with the rank-ups
  // upstream gives them: a Warpriest is an expert caster at 11, a Cloistered Cleric
  // at 7; a Warpriest is trained in light and medium armor and expert in Fortitude
  // from level 1.
  const grant = (slug: string) => ({
    kind: 'grantItem' as const,
    packId: 'class-features',
    slug,
  });
  const doctrine = (slug: string, benefits: string[]) => ({
    ...rankUp(slug, 'cleric', 1, {}, ['cleric-doctrine']),
    ruleElements: benefits.map(grant),
  });
  const features = [
    {
      ...rankUp('doctrine', 'cleric', 1, {}),
      ruleElements: [
        {
          kind: 'choiceSet' as const,
          prompt: 'Choose Doctrine',
          choices: [
            { label: 'Warpriest', value: 'warpriest' },
            { label: 'Cloistered Cleric', value: 'cloistered-cleric' },
          ],
          rollOptionPrefix: 'doctrine',
          grantsFromPackId: 'class-features',
        },
      ],
    },
    doctrine('warpriest', ['first-warpriest', 'fourth-warpriest']),
    doctrine('cloistered-cleric', ['third-cloistered']),
    rankUp('first-warpriest', 'cleric', 1, {
      fortitude: 'expert',
      light: 'trained',
      medium: 'trained',
    }),
    rankUp('fourth-warpriest', 'cleric', 11, { spellcasting: 'expert' }),
    rankUp('third-cloistered', 'cleric', 7, { spellcasting: 'expert' }),
  ];
  const byKey = new Map(features.map((f) => [`${f.packId}/${f.slug}`, f]));
  const cleric = (level: number, doctrineChoice: string) =>
    deriveCharacter({
      build: { ...emptyBuild, classChoices: { doctrine: doctrineChoice } },
      level,
      class: classStub('cleric', 'wis'),
      classFeatures: features,
      resolve: (p, s) => byKey.get(`${p}/${s}`) ?? spellStub(p, s),
    });

  it('a level 1 Warpriest: expert Fortitude, trained in light and medium armor', () => {
    const { ranks } = cleric(1, 'warpriest');
    expect(ranks.fortitude).toBe('expert');
    expect(ranks.armor).toMatchObject({ light: 'trained', medium: 'trained' });
  });

  it('a level 1 Cloistered Cleric gets none of that', () => {
    const { ranks } = cleric(1, 'cloistered-cleric');
    expect(ranks.fortitude).toBe('untrained');
    expect(ranks.armor).toMatchObject({ light: 'untrained', medium: 'untrained' });
  });

  it.each([
    ['cloistered-cleric', 7, 'expert'],
    ['warpriest', 7, 'trained'],
    ['warpriest', 11, 'expert'],
  ] as const)('a %s at level %i casts as %s', (choice, level, rank) => {
    expect(cleric(level, choice).spellcasting?.rank).toBe(rank);
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
