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
    class: 'invented-vanguard',
    level: { value: 1 },
    ...overrides,
  };
}

describe('mapClassFeature -- success', () => {
  it('maps a well-formed class feature with a bare-slug class reference', () => {
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
        traits: [],
        ruleElements: [],
        description: '',
        classSlug: 'invented-vanguard',
        level: 1,
      },
    });
  });

  it('accepts an embedded-object class reference by slug', () => {
    const result = mapClassFeature(
      makeEntry(
        baseSystem({ class: { slug: 'invented-vanguard', name: 'Invented Vanguard' } }),
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.classSlug).toBe('invented-vanguard');
    }
  });

  it('falls back to slugifying an embedded-object class reference with only a name', () => {
    const result = mapClassFeature(
      makeEntry(baseSystem({ class: { name: 'Invented Vanguard' } })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.classSlug).toBe('invented-vanguard');
    }
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

  it('rejects a missing class reference', () => {
    expect(
      mapClassFeature(
        makeEntry(baseSystem({ class: undefined })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-unparseable-class-reference' });
  });

  it('rejects an unparseable class reference', () => {
    expect(
      mapClassFeature(
        makeEntry(baseSystem({ class: { foo: 'bar' } })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-unparseable-class-reference' });
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
