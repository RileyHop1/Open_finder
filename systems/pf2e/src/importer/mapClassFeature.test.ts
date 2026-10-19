import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { mapClassFeature } from './mapClassFeature.js';
import type { UpstreamEntry } from './reader.js';

// Synthetic, invented upstream-shaped fixtures throughout (ADR 0013).
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};
const IMPORTED_AT = '2026-09-29T00:00:00.000Z';

function makeEntry(
  system: Record<string, unknown>,
  overrides: Partial<UpstreamEntry> = {},
): UpstreamEntry {
  return {
    path: 'class-features/invented-bulwark-stance.json',
    id: '5555555555555555',
    name: 'Invented Bulwark Stance',
    type: 'class-feature',
    system,
    ...overrides,
  };
}

function baseSystem(overrides: Record<string, unknown> = {}) {
  return {
    // Upstream carries the class (or classes) as traits.
    traits: { value: ['invented-vanguard'] },
    level: { value: 1 },
    ...overrides,
  };
}

describe('mapClassFeature -- success', () => {
  it('maps a well-formed class feature, taking its classes from its traits', () => {
    const result = mapClassFeature(
      makeEntry({ ...baseSystem(), slug: 'invented-bulwark-stance' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('5555555555555555'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'classFeatures',
        slug: 'invented-bulwark-stance',
        name: 'Invented Bulwark Stance',
        kind: 'classFeature',
        provenance: PROVENANCE,
        traits: ['invented-vanguard'],
        ruleElements: [],
        description: '',
        text: [],
        classSlugs: ['invented-vanguard'],
        level: 1,
        tags: [],
        rankUps: {},
        skillRankUps: {},
      },
    });
  });

  it('reads a school’s curriculum from its text, and gives other features none', () => {
    const link = (name: string) => `@UUID[Compendium.pf2e.spells-srd.Item.${name}]`;
    const description = `<p><strong>Curriculum</strong></p><ul><li><strong>cantrips:</strong> ${link('Glow Spark')}</li><li><strong>1st:</strong> ${link('Ember Gate')}</li></ul>`;
    const result = mapClassFeature(
      makeEntry({ ...baseSystem(), description: { value: description } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok && result.entry.curriculum).toEqual({
      '0': ['glow-spark'],
      '1': ['ember-gate'],
    });
    const plain = mapClassFeature(makeEntry(baseSystem()), PROVENANCE, IMPORTED_AT);
    expect(plain.ok && 'curriculum' in plain.entry).toBe(false);
  });

  it('keeps the choice tags apart from the traits', () => {
    const result = mapClassFeature(
      makeEntry(
        baseSystem({
          traits: { value: ['invented-vanguard'], otherTags: ['invented-stance'] },
        }),
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok && result.entry.tags).toEqual(['invented-stance']);
  });

  it('keeps every trait as a candidate class: a feature several classes share lists them all', () => {
    const result = mapClassFeature(
      makeEntry(
        baseSystem({ traits: { value: ['invented-vanguard', 'invented-scout'] } }),
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok && result.entry.classSlugs).toEqual([
      'invented-vanguard',
      'invented-scout',
    ]);
  });
});

describe('mapClassFeature -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapClassFeature(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects a feature with no traits at all, since it names no class', () => {
    for (const traits of [undefined, { value: [] }]) {
      expect(
        mapClassFeature(makeEntry(baseSystem({ traits })), PROVENANCE, IMPORTED_AT),
      ).toEqual({ ok: false, reason: 'missing-class-trait' });
    }
  });

  it('rejects a missing or invalid level', () => {
    expect(
      mapClassFeature(
        makeEntry(baseSystem({ level: undefined })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-level' });
  });
});

describe('mapClassFeature -- rank-ups', () => {
  const rankUpsOf = (proficiencies: unknown, traits = ['invented-vanguard']) => {
    const result = mapClassFeature(
      makeEntry(
        baseSystem({ traits: { value: traits }, subfeatures: { proficiencies } }),
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    return result.ok ? result.entry.rankUps : undefined;
  };

  it('reads the ranks a feature raises to, by name', () => {
    expect(
      rankUpsOf({
        fortitude: { rank: 2 },
        light: { rank: 1 },
        spellcasting: { rank: 4 },
      }),
    ).toEqual({ fortitude: 'expert', light: 'trained', spellcasting: 'legendary' });
  });

  it('reads a key that is one of the feature’s own classes as that class’s class DC', () => {
    expect(rankUpsOf({ 'invented-vanguard': { attribute: null, rank: 2 } })).toEqual({
      classDc: 'expert',
    });
  });

  it('leaves out a key it does not know and a rank outside 0 to 4', () => {
    expect(
      rankUpsOf({
        'weapon-base-invented': { rank: 2 },
        will: { rank: 9 },
        reflex: { rank: 'expert' },
        perception: { rank: 3 },
      }),
    ).toEqual({ perception: 'master' });
  });

  it('is empty for a feature that raises nothing', () => {
    expect(rankUpsOf(undefined)).toEqual({});
  });
});

describe('mapClassFeature -- skill training and own-class grants', () => {
  it('reads a feature’s skill training and grants its feat to its own class', () => {
    const result = mapClassFeature(
      makeEntry(
        baseSystem({
          rules: [
            {
              key: 'ActiveEffectLike',
              mode: 'upgrade',
              path: 'system.skills.athletics.rank',
              predicate: [{ not: 'feat:invented-explorer:invented-bulwark-stance' }],
              value: 1,
            },
            {
              key: 'GrantItem',
              predicate: [{ or: ['class:invented-vanguard', 'feat:invented-explorer'] }],
              uuid: 'Compendium.pf2e.feats-srd.Item.Invented Companion',
            },
          ],
        }),
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok && result.entry.skillRankUps).toEqual({ athletics: 'trained' });
    expect(result.ok && result.entry.ruleElements).toEqual([
      {
        kind: 'unresolvedGrantItem',
        uuid: 'Compendium.pf2e.feats-srd.Item.Invented Companion',
      },
    ]);
  });
});
