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

function feature(slug: string, level: number): ClassFeatureEntry {
  return {
    ...base(slug, 'class-features'),
    kind: 'classFeature',
    classSlug: 'invented',
    level,
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
});
