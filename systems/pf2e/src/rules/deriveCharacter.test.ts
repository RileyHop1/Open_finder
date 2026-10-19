import { describe, expect, it } from 'vitest';

import type { CharacterBuild } from '../content/characterBuild.js';
import type { CharacterItem } from '../content/character.js';
import type { ClassEntry, ClassFeatureEntry } from '../content/class.js';
import { MAX_GRANT_DEPTH, deriveCharacter } from './deriveCharacter.js';

const NOW = '2026-10-01T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

type ItemEntry = CharacterItem['entry'];

const base = (slug: string, packId = 'feats') => ({
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId,
  slug,
  name: slug,
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [] as ItemEntry['ruleElements'],
  description: '',
});

function feat(slug: string, grants: string[] = []): ItemEntry {
  return {
    ...base(slug),
    kind: 'feat',
    level: 1,
    category: 'general',
    prerequisites: [],
    ruleElements: grants.map((g) => ({
      kind: 'grantItem' as const,
      packId: 'feats',
      slug: g,
    })),
  };
}

function feature(slug: string, level: number, tags: string[] = []): ClassFeatureEntry {
  return {
    ...base(slug, 'class-features'),
    kind: 'classFeature',
    classSlugs: ['invented'],
    level,
    tags,
    rankUps: {},
    skillRankUps: {},
  };
}

const progression = {};
const cls = {
  ...base('invented', 'classes'),
  kind: 'class',
  keyAttributeOptions: ['str', 'dex'],
  hpPerLevel: 10,
  proficiencies: {
    perception: { trained: 1 },
    savingThrows: {
      fortitude: { trained: 1 },
      reflex: { trained: 1 },
      will: { trained: 1 },
    },
    classDc: { trained: 1 },
    weapons: {
      unarmed: progression,
      simple: progression,
      martial: progression,
      advanced: progression,
    },
    armor: {
      unarmored: progression,
      light: progression,
      medium: progression,
      heavy: progression,
    },
  },
  skills: { trainedSkillCount: 2, automaticallyTrained: ['athletics'] },
  advancement: {
    ancestryFeatLevels: [1],
    classFeatLevels: [1],
    generalFeatLevels: [3],
    skillFeatLevels: [2],
    skillIncreaseLevels: [3, 5],
  },
} as unknown as ClassEntry;

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

const noEntries = () => undefined;

describe('deriveCharacter', () => {
  it('derives a bare character from nothing but a level', () => {
    const d = deriveCharacter({ build: emptyBuild, level: 1, resolve: noEntries });
    expect(d.attributes.str).toBe(0);
    expect(d.keyAttribute).toBe('str');
    expect(d.ranks.perception).toBe('untrained');
    expect(d.speed).toBe(25);
    expect(d.items).toEqual([]);
    expect(d.warnings).toEqual([]);
  });

  it('defaults the key attribute to the class’s first option, and warns about one it does not offer', () => {
    expect(
      deriveCharacter({ build: emptyBuild, level: 1, class: cls, resolve: noEntries })
        .keyAttribute,
    ).toBe('str');
    const wrong = deriveCharacter({
      build: emptyBuild,
      level: 1,
      class: cls,
      keyAttribute: 'cha',
      resolve: noEntries,
    });
    expect(wrong.keyAttribute).toBe('cha');
    expect(wrong.warnings).toContainEqual({
      kind: 'key-attribute-not-offered',
      attribute: 'cha',
    });
  });

  it('warns about too many trained skills but still trains them all', () => {
    const d = deriveCharacter({
      build: { ...emptyBuild, trainedSkills: ['a', 'b', 'c'] },
      level: 1,
      class: cls,
      resolve: noEntries,
    });
    // 2 from the class + Int +0 = 2 allowed; 3 chosen.
    expect(d.warnings).toContainEqual({
      kind: 'too-many-trained-skills',
      chosen: 3,
      allowed: 2,
    });
    expect(d.ranks.skills).toMatchObject({
      athletics: 'trained',
      a: 'trained',
      c: 'trained',
    });
  });

  it('counts Intelligence toward the trained skills allowed', () => {
    const d = deriveCharacter({
      build: {
        ...emptyBuild,
        boosts: [{ level: 1, source: 'free', attributes: ['int'] }],
        trainedSkills: ['a', 'b', 'c'],
      },
      level: 1,
      class: cls,
      resolve: noEntries,
    });
    expect(d.warnings.some((w) => w.kind === 'too-many-trained-skills')).toBe(false);
  });

  it('raises a skill one rank per increase, and warns about one taken at the wrong level', () => {
    const d = deriveCharacter({
      build: {
        ...emptyBuild,
        skillIncreases: [
          { level: 3, skill: 'athletics' },
          { level: 4, skill: 'athletics' },
          { level: 5, skill: 'stealth' },
        ],
      },
      level: 5,
      class: cls,
      resolve: noEntries,
    });
    expect(d.ranks.skills.athletics).toBe('master');
    expect(d.ranks.skills.stealth).toBe('trained');
    expect(d.warnings).toEqual([{ kind: 'skill-increase-not-available', level: 4 }]);
  });

  it('ignores increases above the character’s level', () => {
    const d = deriveCharacter({
      build: { ...emptyBuild, skillIncreases: [{ level: 5, skill: 'athletics' }] },
      level: 3,
      class: cls,
      resolve: noEntries,
    });
    expect(d.ranks.skills.athletics).toBe('trained');
  });

  it('grants the class features due by level, lowest first', () => {
    const d = deriveCharacter({
      build: emptyBuild,
      level: 3,
      class: cls,
      classFeatures: [
        feature('late', 9),
        feature('b-two', 3),
        feature('a-one', 1),
        feature('a-two', 3),
      ],
      resolve: noEntries,
    });
    expect(d.items.map((i) => i.slug)).toEqual(['a-one', 'a-two', 'b-two']);
  });

  it('does not grant a tagged feature automatically: it is one alternative of a choice', () => {
    const d = deriveCharacter({
      build: emptyBuild,
      level: 1,
      class: cls,
      classFeatures: [
        feature('instinct', 1),
        feature('animal-instinct', 1, ['barbarian-instinct']),
        feature('dragon-instinct', 1, ['barbarian-instinct']),
      ],
      resolve: noEntries,
    });
    expect(d.items.map((i) => i.slug)).toEqual(['instinct']);
  });

  it('resolves picked feats and what they grant, once each', () => {
    const entries = new Map([
      ['feats/one', feat('one', ['two', 'three'])],
      ['feats/two', feat('two', ['three'])],
      ['feats/three', feat('three')],
    ]);
    const d = deriveCharacter({
      build: {
        ...emptyBuild,
        feats: [
          { slot: 'ancestry', level: 1, feat: { packId: 'feats', slug: 'one' } },
          { slot: 'class', level: 1, feat: { packId: 'feats', slug: 'three' } },
        ],
      },
      level: 1,
      class: cls,
      resolve: (p, s) => entries.get(`${p}/${s}`),
    });
    expect(d.items.map((i) => i.slug)).toEqual(['one', 'two', 'three']);
    expect(d.warnings).toEqual([]);
  });

  it('stops following grants at the depth limit', () => {
    const chain = Array.from({ length: MAX_GRANT_DEPTH + 3 }, (_, i) =>
      feat(`f${i}`, i + 1 < MAX_GRANT_DEPTH + 3 ? [`f${i + 1}`] : []),
    );
    const entries = new Map(chain.map((e) => [`feats/${e.slug}`, e]));
    const d = deriveCharacter({
      build: {
        ...emptyBuild,
        feats: [{ slot: 'general', level: 1, feat: { packId: 'feats', slug: 'f0' } }],
      },
      level: 1,
      resolve: (p, s) => entries.get(`${p}/${s}`),
    });
    expect(d.items).toHaveLength(MAX_GRANT_DEPTH + 1);
  });

  it('warns about a missing entry and a feat in a slot the class does not have, and still goes on', () => {
    const d = deriveCharacter({
      build: {
        ...emptyBuild,
        feats: [
          { slot: 'archetype', level: 1, feat: { packId: 'feats', slug: 'nowhere' } },
        ],
      },
      level: 1,
      class: cls,
      resolve: noEntries,
    });
    expect(d.warnings).toEqual([
      { kind: 'feat-slot-not-available', slot: 'archetype', level: 1 },
      { kind: 'missing-entry', packId: 'feats', slug: 'nowhere' },
    ]);
  });

  it('passes boost warnings through', () => {
    const d = deriveCharacter({
      build: {
        ...emptyBuild,
        boosts: [{ level: 1, source: 'free', attributes: ['str', 'str'] }],
      },
      level: 1,
      resolve: noEntries,
    });
    expect(d.attributes.str).toBe(2);
    expect(d.warnings).toEqual([
      { kind: 'duplicate-boost', level: 1, source: 'free', attribute: 'str' },
    ]);
  });

  describe('class choices', () => {
    const instinct: ClassFeatureEntry = {
      ...feature('instinct', 1),
      ruleElements: [
        {
          kind: 'choiceSet',
          prompt: 'Choose Instinct',
          choices: [
            { label: 'Alpha', value: 'alpha' },
            { label: 'Beta', value: 'beta' },
          ],
          rollOptionPrefix: 'instinct',
          grantsFromPackId: 'class-features',
        },
      ],
    };
    const alpha = feature('alpha', 1, ['instinct']);
    const beta = feature('beta', 1, ['instinct']);
    const all = new Map([alpha, beta].map((f) => [`class-features/${f.slug}`, f]));
    const derive = (classChoices: Record<string, string>) =>
      deriveCharacter({
        build: { ...emptyBuild, classChoices },
        level: 1,
        classFeatures: [instinct, alpha, beta],
        resolve: (p, s) => all.get(`${p}/${s}`),
      });

    it('grants the chosen feature, not its alternatives, and records the choice', () => {
      const d = derive({ instinct: 'alpha' });
      expect(d.items.map((i) => i.slug)).toEqual(['instinct', 'alpha']);
      expect(d.choices).toEqual({ instinct: 'alpha' });
      expect(d.warnings).toEqual([]);
    });

    it('warns, and grants neither, when the choice has not been made', () => {
      const d = derive({});
      expect(d.items.map((i) => i.slug)).toEqual(['instinct']);
      expect(d.choices).toEqual({});
      expect(d.warnings).toEqual([
        { kind: 'choice-not-made', choice: 'instinct', feature: 'instinct' },
      ]);
    });

    it('applies a choice the feature does not offer, with a warning (ADR 0023)', () => {
      const d = derive({ instinct: 'beta-prime' });
      expect(d.choices).toEqual({ instinct: 'beta-prime' });
      expect(d.warnings).toEqual([
        { kind: 'choice-not-offered', choice: 'instinct', value: 'beta-prime' },
        { kind: 'missing-entry', packId: 'class-features', slug: 'beta-prime' },
      ]);
    });

    it('ignores a choice for a feature the character does not have yet', () => {
      const d = deriveCharacter({
        build: { ...emptyBuild, classChoices: { instinct: 'alpha' } },
        level: 1,
        classFeatures: [{ ...instinct, level: 5 }, alpha, beta],
        resolve: (p, s) => all.get(`${p}/${s}`),
      });
      expect(d.items).toEqual([]);
      expect(d.choices).toEqual({});
    });
  });

  describe('spell picks', () => {
    const spell = (slug: string, cantrip: boolean): ItemEntry => ({
      ...base(slug, 'spells'),
      kind: 'spell',
      traits: cantrip ? ['cantrip'] : [],
      rank: 1,
      traditions: ['occult'],
      castTime: '2',
      range: { kind: 'touch' },
      sustained: false,
    });
    const all = new Map<string, ItemEntry>([
      ...['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(
        (slug) => [`spells/${slug}`, spell(slug, true)] as const,
      ),
      ['spells/r1', spell('r1', false)],
      ['spells/r2', spell('r2', false)],
      ['spells/r3', spell('r3', false)],
      ['spells/r4', spell('r4', false)],
      // Invented entries under the slugs the Bard's grant table names (`classSpells.ts`).
      ['spells/courageous-anthem', spell('courageous-anthem', true)],
      ['spells/counter-performance', spell('counter-performance', false)],
      ['spells/sure-strike', spell('sure-strike', false)],
      ['feats/not-magic', feat('not-magic')],
    ]);
    // A spontaneous caster with no mystery chosen, so only the picks count.
    const oracle = { ...cls, slug: 'oracle', name: 'Oracle' };
    const ref = (slug: string, packId = 'spells') => ({ packId, slug });
    const derive = (
      cantrips: string[],
      ranked: { packId: string; slug: string }[],
      cast = oracle,
      classChoices: Record<string, string> = {},
    ) =>
      deriveCharacter({
        build: {
          ...emptyBuild,
          classChoices,
          spells: { cantrips: cantrips.map((c) => ref(c)), ranked },
        },
        level: 1,
        class: cast,
        resolve: (p, s) => all.get(`${p}/${s}`),
      });

    it('grants every picked spell and hands the picks back by ref', () => {
      const d = derive(['c1', 'c2'], [ref('r1')]);
      expect(d.items.map((i) => i.slug)).toEqual(['c1', 'c2', 'r1']);
      expect(d.spellPicks).toEqual({
        cantrips: [ref('c1'), ref('c2')],
        ranked: [ref('r1')],
      });
      expect(d.warnings).toEqual([]);
    });

    it('warns past the class’s cantrips but grants them all (ADR 0023)', () => {
      const d = derive(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'], []);
      expect(d.spellPicks.cantrips).toHaveLength(6);
      expect(d.warnings).toEqual([{ kind: 'too-many-cantrips', chosen: 6, allowed: 5 }]);
    });

    it('leaves out a pick that is missing or is not a spell, and says so', () => {
      const d = derive([], [ref('gone'), ref('not-magic', 'feats')]);
      expect(d.spellPicks.ranked).toEqual([]);
      expect(d.items.map((i) => i.slug)).not.toContain('not-magic');
      expect(d.warnings).toEqual([
        { kind: 'missing-entry', packId: 'spells', slug: 'gone' },
        { kind: 'not-a-spell', packId: 'feats', slug: 'not-magic' },
      ]);
    });

    it('warns past a spontaneous caster’s repertoire (its slots), granting them all', () => {
      const d = derive([], [ref('r1'), ref('r2'), ref('r3'), ref('r4')]);
      expect(d.spellPicks.ranked).toHaveLength(4);
      expect(d.warnings).toEqual([
        { kind: 'too-many-known-spells', chosen: 4, allowed: 3 },
      ]);
    });

    describe('what the class grants by itself', () => {
      const bard = { ...cls, slug: 'bard', name: 'Bard' };

      it('grants the class’s cantrip, focus spell and the muse’s spell, and its focus pool', () => {
        const d = derive(['c1'], [ref('r1')], bard, { muse: 'enigma' });
        expect(d.focusPoints).toBe(1);
        expect(d.spellPicks).toEqual({
          cantrips: [ref('c1'), ref('courageous-anthem')],
          ranked: [ref('r1'), ref('sure-strike')],
        });
        expect(d.items.map((i) => i.slug)).toContain('counter-performance');
        // The granted spells are not counted against the picks.
        expect(d.warnings).toEqual([]);
      });

      it('adds no muse spell before the muse is chosen', () => {
        const d = derive([], [], bard);
        expect(d.spellPicks.ranked).toEqual([]);
        expect(d.spellPicks.cantrips).toEqual([ref('courageous-anthem')]);
      });

      it('gives a class with no row no focus pool and nothing extra', () => {
        const fighter = { ...cls, slug: 'fighter', name: 'Fighter' };
        const d = derive(['c1'], [], fighter);
        expect(d.focusPoints).toBe(0);
        expect(d.spellPicks.cantrips).toEqual([ref('c1')]);
      });
    });
  });

  describe('class features granted by other features', () => {
    const grantFeature = (slug: string) => ({
      kind: 'grantItem' as const,
      packId: 'class-features',
      slug,
    });
    const step = (slug: string, level: number) => feature(slug, level);
    // A doctrine: chosen at level 1 (tagged), granting a benefit at each of its levels.
    const warpath = {
      ...feature('warpath', 1, ['invented-doctrine']),
      ruleElements: [grantFeature('first-step'), grantFeature('second-step')],
    };
    const doctrine = {
      ...feature('doctrine', 1),
      ruleElements: [
        {
          kind: 'choiceSet' as const,
          prompt: 'Choose Doctrine',
          choices: [{ label: 'Warpath', value: 'warpath' }],
          rollOptionPrefix: 'doctrine',
          grantsFromPackId: 'class-features',
        },
      ],
    };
    const features = [doctrine, warpath, step('first-step', 1), step('second-step', 3)];
    const byKey = new Map(features.map((f) => [`${f.packId}/${f.slug}`, f as ItemEntry]));
    const derive = (level: number, classChoices: Record<string, string>) =>
      deriveCharacter({
        build: { ...emptyBuild, classChoices },
        level,
        class: cls,
        classFeatures: features,
        resolve: (p, s) => byKey.get(`${p}/${s}`),
      });

    it('grants a benefit only from its own level', () => {
      const slugs = (level: number) =>
        derive(level, { doctrine: 'warpath' }).items.map((i) => i.slug);
      expect(slugs(1)).toEqual(['doctrine', 'warpath', 'first-step']);
      expect(slugs(3)).toEqual(['doctrine', 'warpath', 'first-step', 'second-step']);
    });

    it('does not grant a feature another feature grants on its own, so no doctrine is free', () => {
      expect(derive(3, {}).items.map((i) => i.slug)).toEqual(['doctrine']);
    });
  });

  describe('rank-ups', () => {
    const raising = (
      slug: string,
      level: number,
      rankUps: ClassFeatureEntry['rankUps'],
    ) => ({
      ...feature(slug, level),
      rankUps,
    });
    const features = [
      raising('bravery', 3, { will: 'expert', perception: 'expert' }),
      raising('expertise', 5, { classDc: 'expert', martial: 'expert', light: 'trained' }),
      // A rank-up never lowers: the class's trained Fortitude stays trained.
      raising('quirk', 1, { fortitude: 'untrained' }),
    ];
    const ranks = (level: number) =>
      deriveCharacter({
        build: emptyBuild,
        level,
        class: cls,
        classFeatures: features,
        resolve: noEntries,
      }).ranks;

    it('raises each rank a class feature names, from the feature’s level on', () => {
      expect(ranks(1)).toMatchObject({ will: 'trained', perception: 'trained' });
      expect(ranks(3)).toMatchObject({ will: 'expert', perception: 'expert' });
      const at5 = ranks(5);
      expect(at5.classDc).toBe('expert');
      expect(at5.weapons.martial).toBe('expert');
      expect(at5.armor.light).toBe('trained');
    });

    it('never lowers a rank', () => {
      expect(ranks(5).fortitude).toBe('trained');
    });
  });

  describe('skills a class feature trains', () => {
    const racket = (skillRankUps: ClassFeatureEntry['skillRankUps'], level = 1) => ({
      ...feature('invented-racket', level),
      skillRankUps,
    });
    const derive = (
      features: ClassFeatureEntry[],
      build: Partial<CharacterBuild> = {},
      level = 1,
    ) =>
      deriveCharacter({
        build: { ...emptyBuild, ...build },
        level,
        class: cls,
        classFeatures: features,
        resolve: noEntries,
      });

    it('trains the skill, from the feature’s level on', () => {
      expect(derive([racket({ thievery: 'trained' })]).ranks.skills.thievery).toBe(
        'trained',
      );
      expect(
        derive([racket({ stealth: 'trained' }, 3)]).ranks.skills.stealth,
      ).toBeUndefined();
    });

    it('applies a skill increase on top of it', () => {
      const d = derive(
        [racket({ thievery: 'trained' })],
        { skillIncreases: [{ level: 3, skill: 'thievery' }] },
        3,
      );
      expect(d.ranks.skills.thievery).toBe('expert');
    });

    it('warns when the skill is already trained, and allows one more pick for it (ADR 0023)', () => {
      // The class trains athletics automatically; two picks are allowed.
      const d = derive([racket({ athletics: 'trained' })], {
        trainedSkills: ['arcana', 'crafting', 'diplomacy'],
      });
      expect(d.ranks.skills.athletics).toBe('trained');
      expect(d.warnings).toEqual([
        { kind: 'skill-trained-twice', skill: 'athletics', feature: 'invented-racket' },
      ]);
    });
  });
});
