import { describe, expect, it } from 'vitest';

import { featEntrySchema } from '../content/feat.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry } from './draftEntry.js';
import { resolveDependencies } from './resolveDependencies.js';
import type { AncestryEntry } from '../content/ancestry.js';
import type { ClassEntry, ClassFeatureEntry } from '../content/class.js';
import type { FeatEntry } from '../content/feat.js';
import type { GearEntry } from '../content/gear.js';
import type { HeritageEntry } from '../content/heritage.js';
import type { SpellEntry } from '../content/spell.js';

// Synthetic, invented fixtures throughout (ADR 0013), constructed directly
// at the draft-entry shape rather than through a mapper -- this pass
// operates on whatever the mappers produced, regardless of which one.
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};
const IMPORTED_AT = '2026-09-29T00:00:00.000Z';

/** A `Compendium....Item.<id>` uuid naming the entry with this upstream id. */
function grantUuidFor(upstreamId: string): string {
  return `Compendium.pf2e.feats.Item.${upstreamId}`;
}

function makeFeat(
  upstreamId: string,
  overrides: Partial<DraftEntry<FeatEntry>> = {},
): DraftEntry<FeatEntry> {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'feats',
    slug: `invented-feat-${upstreamId}`,
    name: `Invented Feat ${upstreamId}`,
    kind: 'feat',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    level: 1,
    category: 'general',
    prerequisites: [],
    ...overrides,
  };
}

function makeAncestry(
  upstreamId: string,
  overrides: Partial<DraftEntry<AncestryEntry>> = {},
): DraftEntry<AncestryEntry> {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'ancestries',
    slug: `invented-ancestry-${upstreamId}`,
    name: `Invented Ancestry ${upstreamId}`,
    kind: 'ancestry',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    hp: 8,
    size: 'medium',
    speed: 25,
    boosts: [],
    freeBoosts: 0,
    flaws: [],
    languages: [],
    ...overrides,
  };
}

function makeHeritage(
  upstreamId: string,
  overrides: Partial<DraftEntry<HeritageEntry>> = {},
): DraftEntry<HeritageEntry> {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'heritages',
    slug: `invented-heritage-${upstreamId}`,
    name: `Invented Heritage ${upstreamId}`,
    kind: 'heritage',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    ...overrides,
  };
}

function makeClass(
  upstreamId: string,
  overrides: Partial<DraftEntry<ClassEntry>> = {},
): DraftEntry<ClassEntry> {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'classes',
    slug: `invented-class-${upstreamId}`,
    name: `Invented Class ${upstreamId}`,
    kind: 'class',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    keyAttributeOptions: ['str'],
    hpPerLevel: 10,
    proficiencies: {
      perception: {},
      savingThrows: { fortitude: {}, reflex: {}, will: {} },
      classDc: {},
      weapons: { unarmed: {}, simple: {}, martial: {}, advanced: {} },
      armor: { unarmored: {}, light: {}, medium: {}, heavy: {} },
    },
    skills: { trainedSkillCount: 0, automaticallyTrained: [] },
    ...overrides,
  };
}

function makeClassFeature(
  upstreamId: string,
  overrides: Partial<DraftEntry<ClassFeatureEntry>> = {},
): DraftEntry<ClassFeatureEntry> {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'classFeatures',
    slug: `invented-class-feature-${upstreamId}`,
    name: `Invented Class Feature ${upstreamId}`,
    kind: 'classFeature',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    classSlugs: [`invented-class-${upstreamId}`],
    level: 1,
    tags: [],
    rankUps: {},
    skillRankUps: {},
    ...overrides,
  };
}

function makeGear(
  upstreamId: string,
  overrides: Partial<DraftEntry<GearEntry>> = {},
): DraftEntry<GearEntry> {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'equipment',
    slug: `invented-gear-${upstreamId}`,
    name: `Invented Gear ${upstreamId}`,
    kind: 'gear',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    ...overrides,
  };
}

function makeSpell(
  upstreamId: string,
  overrides: Partial<DraftEntry<SpellEntry>> = {},
): DraftEntry<SpellEntry> {
  return {
    id: deterministicId(upstreamId),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'spells',
    slug: `invented-spell-${upstreamId}`,
    name: `Invented Spell ${upstreamId}`,
    kind: 'spell',
    provenance: PROVENANCE,
    traits: [],
    ruleElements: [],
    description: '',
    rank: 3,
    traditions: [],
    castTime: '2',
    range: { kind: 'self' },
    sustained: false,
    ...overrides,
  };
}

describe('resolveDependencies -- grantItem resolution', () => {
  it('resolves a grantItem target that survives the license/scope filters', () => {
    const target = makeFeat('bbbbbbbbbbbbbbbb');
    const granter = makeFeat('aaaaaaaaaaaaaaaa', {
      ruleElements: [
        { kind: 'unresolvedGrantItem', uuid: grantUuidFor('bbbbbbbbbbbbbbbb') },
      ],
    });

    const result = resolveDependencies([granter, target]);

    expect(result.drops).toEqual([]);
    expect(result.kept).toHaveLength(2);
    const resolvedGranter = result.kept.find((e) => e.id === granter.id);
    expect(resolvedGranter?.ruleElements).toEqual([
      { kind: 'grantItem', packId: 'feats', slug: target.slug },
    ]);
  });

  it('produces an entry valid against the real per-kind schema once resolved', () => {
    const target = makeFeat('dddddddddddddddd');
    const granter = makeFeat('cccccccccccccccc', {
      ruleElements: [
        { kind: 'unresolvedGrantItem', uuid: grantUuidFor('dddddddddddddddd') },
      ],
    });

    const result = resolveDependencies([granter, target]);
    const resolvedGranter = result.kept.find((e) => e.id === granter.id);
    expect(featEntrySchema.safeParse(resolvedGranter).success).toBe(true);
  });

  it('passes non-grant elements through unchanged', () => {
    const rollOption = { kind: 'rollOption' as const, option: 'invented:tag' };
    const entry = makeFeat('eeeeeeeeeeeeeeee', { ruleElements: [rollOption] });

    const result = resolveDependencies([entry]);
    expect(result.kept[0]?.ruleElements).toEqual([rollOption]);
  });

  it('drops the whole entry when a grant target is missing, even alongside other valid elements', () => {
    const rollOption = { kind: 'rollOption' as const, option: 'invented:tag' };
    const entry = makeFeat('ffffffffffffffff', {
      ruleElements: [
        rollOption,
        { kind: 'unresolvedGrantItem', uuid: grantUuidFor('0000000000000000') },
      ],
    });

    const result = resolveDependencies([entry]);
    expect(result.kept).toEqual([]);
    expect(result.drops).toEqual([
      {
        id: entry.id,
        slug: entry.slug,
        kind: 'feat',
        reason: 'grant-target-excluded',
        round: 1,
      },
    ]);
  });
});

describe('resolveDependencies -- a progression flag’s grants', () => {
  it('grants a kept target, and leaves a missing one inert without dropping the entry', () => {
    const target = makeFeat('ffffffffffffffff');
    const doctrine = makeFeat('eeeeeeeeeeeeeeee', {
      ruleElements: [
        { kind: 'unresolvedFlagGrant', uuid: grantUuidFor('ffffffffffffffff') },
        { kind: 'unresolvedFlagGrant', uuid: grantUuidFor('0000000000000000') },
      ],
    });

    const result = resolveDependencies([doctrine, target]);

    expect(result.drops).toEqual([]);
    expect(result.kept.find((e) => e.id === doctrine.id)?.ruleElements).toEqual([
      { kind: 'grantItem', packId: 'feats', slug: target.slug },
      {
        kind: 'inert',
        upstreamKind: 'ActiveEffectLike',
        reason: 'flag-grant-target-excluded',
      },
    ]);
  });
});

describe('resolveDependencies -- cascading fixed point', () => {
  it('drops an A-grants-B-grants-C chain in successive rounds when C was excluded from the start', () => {
    const b = makeFeat('2222222222222222', {
      ruleElements: [
        { kind: 'unresolvedGrantItem', uuid: grantUuidFor('3333333333333333') },
      ],
    });
    const a = makeFeat('1111111111111111', {
      ruleElements: [
        { kind: 'unresolvedGrantItem', uuid: grantUuidFor('2222222222222222') },
      ],
    });
    // C ("3333...") was never passed in at all -- excluded upstream of this pass.

    const result = resolveDependencies([a, b]);

    expect(result.kept).toEqual([]);
    expect(result.drops).toEqual([
      { id: b.id, slug: b.slug, kind: 'feat', reason: 'grant-target-excluded', round: 1 },
      { id: a.id, slug: a.slug, kind: 'feat', reason: 'grant-target-excluded', round: 2 },
    ]);
  });

  it('keeps an entry whose grant chain fully resolves', () => {
    const c = makeFeat('6666666666666666');
    const b = makeFeat('5555555555555555', {
      ruleElements: [
        { kind: 'unresolvedGrantItem', uuid: grantUuidFor('6666666666666666') },
      ],
    });
    const a = makeFeat('4444444444444444', {
      ruleElements: [
        { kind: 'unresolvedGrantItem', uuid: grantUuidFor('5555555555555555') },
      ],
    });

    const result = resolveDependencies([a, b, c]);

    expect(result.drops).toEqual([]);
    expect(result.kept).toHaveLength(3);
  });
});

describe('resolveDependencies -- heritage/ancestry and class-feature/class references', () => {
  it('keeps a versatile heritage (no ancestry reference) regardless of which ancestries exist', () => {
    const heritage = makeHeritage('7777777777777777');
    const result = resolveDependencies([heritage]);
    expect(result.drops).toEqual([]);
    expect(result.kept).toHaveLength(1);
  });

  it('keeps a heritage whose ancestry survived the filters', () => {
    const ancestry = makeAncestry('8888888888888888');
    const heritage = makeHeritage('9999999999999999', { ancestrySlug: ancestry.slug });

    const result = resolveDependencies([ancestry, heritage]);
    expect(result.drops).toEqual([]);
    expect(result.kept).toHaveLength(2);
  });

  it('drops a heritage whose ancestry was excluded', () => {
    const heritage = makeHeritage('aaaaaaaaaaaaaaab', {
      ancestrySlug: 'excluded-ancestry',
    });

    const result = resolveDependencies([heritage]);
    expect(result.kept).toEqual([]);
    expect(result.drops).toEqual([
      {
        id: heritage.id,
        slug: heritage.slug,
        kind: 'heritage',
        reason: 'ancestry-excluded',
        round: 1,
      },
    ]);
  });

  it('keeps a class feature whose class survived the filters', () => {
    const cls = makeClass('cccccccccccccccd');
    const feature = makeClassFeature('dddddddddddddddd', { classSlugs: [cls.slug] });

    const result = resolveDependencies([cls, feature]);
    expect(result.drops).toEqual([]);
    expect(result.kept).toHaveLength(2);
  });

  it('trims a shared class feature to the classes that were kept, and keeps it if any survived', () => {
    const cls = makeClass('cccccccccccccccd');
    const feature = makeClassFeature('dddddddddddddddd', {
      classSlugs: ['excluded-class', cls.slug, 'rare'],
    });

    const result = resolveDependencies([cls, feature]);
    expect(result.drops).toEqual([]);
    const kept = result.kept.find((e) => e.kind === 'classFeature');
    expect(kept?.kind === 'classFeature' && kept.classSlugs).toEqual([cls.slug]);
  });

  it('drops a class feature whose class was excluded', () => {
    const feature = makeClassFeature('eeeeeeeeeeeeeeef', {
      classSlugs: ['excluded-class'],
    });

    const result = resolveDependencies([feature]);
    expect(result.kept).toEqual([]);
    expect(result.drops).toEqual([
      {
        id: feature.id,
        slug: feature.slug,
        kind: 'classFeature',
        reason: 'class-excluded',
        round: 1,
      },
    ]);
  });
});

describe("resolveDependencies -- a consumable's spell reference", () => {
  it('keeps consumable.spell when the referenced spell survives', () => {
    const spell = makeSpell('ffffffffffffffff');
    const scroll = makeGear('eeeeeeeeeeeeeeee', {
      consumable: {
        category: 'scroll',
        spell: { packId: spell.packId, slug: spell.slug, rank: 3 },
      },
    });

    const result = resolveDependencies([scroll, spell]);

    expect(result.drops).toEqual([]);
    const keptScroll = result.kept.find((entry) => entry.kind === 'gear');
    expect(
      keptScroll?.kind === 'gear' ? keptScroll.consumable?.spell : undefined,
    ).toEqual({
      packId: spell.packId,
      slug: spell.slug,
      rank: 3,
    });
  });

  it('clears consumable.spell (keeping the gear entry) when the referenced spell was not imported', () => {
    const scroll = makeGear('eeeeeeeeeeeeeeee', {
      consumable: {
        category: 'scroll',
        spell: { packId: 'spells', slug: 'excluded-spell', rank: 3 },
      },
    });

    const result = resolveDependencies([scroll]);

    expect(result.drops).toEqual([]);
    expect(result.kept).toHaveLength(1);
    const keptScroll = result.kept[0];
    expect(keptScroll?.kind === 'gear' ? keptScroll.consumable : undefined).toEqual({
      category: 'scroll',
    });
  });

  it('clears consumable.spell when the referenced spell is dropped in a later round', () => {
    const scroll = makeGear('eeeeeeeeeeeeeeee', {
      consumable: {
        category: 'scroll',
        spell: { packId: 'spells', slug: 'invented-spell-ffffffffffffffff', rank: 3 },
      },
    });
    const feature = makeClassFeature('aaaaaaaaaaaaaaaa', {
      classSlugs: ['excluded-class'],
    });
    const spell = makeSpell('ffffffffffffffff', {
      ruleElements: [
        { kind: 'unresolvedGrantItem', uuid: grantUuidFor('aaaaaaaaaaaaaaaa') },
      ],
    });

    const result = resolveDependencies([scroll, spell, feature]);

    const keptScroll = result.kept.find((entry) => entry.kind === 'gear');
    expect(keptScroll?.kind === 'gear' ? keptScroll.consumable : undefined).toEqual({
      category: 'scroll',
    });
  });

  it('leaves an ordinary gear entry (no consumable) untouched', () => {
    const gear = makeGear('eeeeeeeeeeeeeeee');

    const result = resolveDependencies([gear]);

    expect(result.kept).toEqual([gear]);
  });
});

describe('resolveDependencies -- tag choices', () => {
  const cls = makeClass('cccccccccccccccc');
  const parent = (extra: DraftEntry<ClassFeatureEntry>['ruleElements'] = []) =>
    makeClassFeature('aaaaaaaaaaaaaaaa', {
      name: 'Invented Instinct',
      classSlugs: [cls.slug],
      ruleElements: [
        {
          kind: 'unresolvedTagChoice',
          tag: 'invented-instinct',
          flag: 'instinct',
          prompt: 'PF2E.Prompt.Key',
          rollOptionPrefix: 'instinct',
        },
        { kind: 'unresolvedChosenGrant', flag: 'instinct' },
        ...extra,
      ],
    });
  const option = (id: string, name: string) =>
    makeClassFeature(id, {
      name,
      slug: name.toLowerCase(),
      classSlugs: [cls.slug],
      tags: ['invented-instinct'],
    });

  it('offers every kept feature with the tag, sorted, and grants the pick', () => {
    const result = resolveDependencies([
      cls,
      parent(),
      option('bbbbbbbbbbbbbbbb', 'Zeta'),
      option('dddddddddddddddd', 'Alpha'),
      makeClassFeature('eeeeeeeeeeeeeeee', { classSlugs: [cls.slug], tags: ['other'] }),
    ]);

    const kept = result.kept.find((e) => e.name === 'Invented Instinct');
    expect(kept?.ruleElements).toEqual([
      {
        kind: 'choiceSet',
        prompt: 'Choose Invented Instinct',
        choices: [
          { label: 'Alpha', value: 'alpha' },
          { label: 'Zeta', value: 'zeta' },
        ],
        rollOptionPrefix: 'instinct',
        grantsFromPackId: 'classFeatures',
      },
    ]);
  });

  it('goes inert, visibly, when no feature carries the tag', () => {
    const result = resolveDependencies([cls, parent()]);

    const kept = result.kept.find((e) => e.name === 'Invented Instinct');
    expect(kept?.ruleElements).toEqual([
      { kind: 'inert', upstreamKind: 'ChoiceSet', reason: 'no-features-for-tag' },
    ]);
  });

  it('flags a chosen grant that has no choice to fold into', () => {
    const lone = makeClassFeature('aaaaaaaaaaaaaaaa', {
      classSlugs: [cls.slug],
      ruleElements: [{ kind: 'unresolvedChosenGrant', flag: 'missing' }],
    });

    const result = resolveDependencies([cls, lone]);

    expect(result.kept.find((e) => e.kind === 'classFeature')?.ruleElements).toEqual([
      { kind: 'inert', upstreamKind: 'GrantItem', reason: 'chosen-grant-without-choice' },
    ]);
  });
});

describe('resolveDependencies -- grants by name', () => {
  it('resolves a grant that names its target, as real upstream data does', () => {
    const target = makeFeat('aaaaaaaaaaaaaaaa', {
      name: 'Invented Target',
      slug: 'invented-target',
    });
    const granter = makeFeat('bbbbbbbbbbbbbbbb', {
      ruleElements: [
        {
          kind: 'unresolvedGrantItem',
          uuid: 'Compendium.pf2e.feats-srd.Item.Invented Target',
        },
      ],
    });

    const result = resolveDependencies([target, granter]);

    expect(result.drops).toEqual([]);
    const kept = result.kept.find((e) => e.id === granter.id);
    expect(kept?.ruleElements).toEqual([
      { kind: 'grantItem', packId: 'feats', slug: 'invented-target' },
    ]);
  });

  it('drops the granter when the named target is not imported', () => {
    const granter = makeFeat('bbbbbbbbbbbbbbbb', {
      ruleElements: [
        {
          kind: 'unresolvedGrantItem',
          uuid: 'Compendium.pf2e.feats-srd.Item.Not Imported',
        },
      ],
    });

    const result = resolveDependencies([granter]);

    expect(result.drops).toMatchObject([{ reason: 'grant-target-excluded' }]);
  });
});
