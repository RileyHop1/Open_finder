import { describe, expect, it } from 'vitest';

import { featEntrySchema } from '../content/feat.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry } from './draftEntry.js';
import { resolveDependencies } from './resolveDependencies.js';
import type { AncestryEntry } from '../content/ancestry.js';
import type { ClassEntry, ClassFeatureEntry } from '../content/class.js';
import type { FeatEntry } from '../content/feat.js';
import type { HeritageEntry } from '../content/heritage.js';

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
    classSlug: `invented-class-${upstreamId}`,
    level: 1,
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
    const feature = makeClassFeature('dddddddddddddddd', { classSlug: cls.slug });

    const result = resolveDependencies([cls, feature]);
    expect(result.drops).toEqual([]);
    expect(result.kept).toHaveLength(2);
  });

  it('drops a class feature whose class was excluded', () => {
    const feature = makeClassFeature('eeeeeeeeeeeeeeef', { classSlug: 'excluded-class' });

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
