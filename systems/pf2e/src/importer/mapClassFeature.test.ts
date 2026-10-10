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
      },
    });
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
