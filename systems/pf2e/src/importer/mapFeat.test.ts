import { describe, expect, it } from 'vitest';

import { mapFeat } from './mapFeat.js';
import { deterministicId } from './deterministicId.js';
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
    path: 'feats/invented-feat.json',
    id: 'aaaaaaaaaaaaaaaa',
    name: 'Invented Feat',
    type: 'feat',
    system,
    ...overrides,
  };
}

describe('mapFeat -- success', () => {
  it('maps a well-formed feat', () => {
    const result = mapFeat(
      makeEntry({
        level: { value: 3 },
        category: 'general',
        slug: 'invented-feat',
        traits: { value: ['general', 'skill'] },
        description: { value: '<p>Do a thing.</p>' },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('aaaaaaaaaaaaaaaa'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'feats',
        slug: 'invented-feat',
        name: 'Invented Feat',
        kind: 'feat',
        provenance: PROVENANCE,
        traits: ['general', 'skill'],
        ruleElements: [],
        description: '<p>Do a thing.</p>',
        level: 3,
        category: 'general',
        prerequisites: [],
      },
    });
  });

  it('derives a slug from the name when system.slug is absent', () => {
    const result = mapFeat(
      makeEntry({ level: { value: 1 }, category: 'general' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.slug).toBe('invented-feat');
    }
  });

  it('maps an action-cost feat', () => {
    const result = mapFeat(
      makeEntry({
        level: { value: 2 },
        category: 'skill',
        actionType: { value: 'action' },
        actions: { value: 1 },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.actionCost).toBe('one');
    }
  });

  it('omits actionCost entirely for a passive feat -- the common case', () => {
    const result = mapFeat(
      makeEntry({ level: { value: 1 }, category: 'general' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.actionCost).toBeUndefined();
    }
  });

  it('filters out an invalid trait rather than failing the whole entry', () => {
    const result = mapFeat(
      makeEntry({
        level: { value: 1 },
        category: 'general',
        traits: { value: ['general', 'Not A Slug'] },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.traits).toEqual(['general']);
    }
  });

  it('maps prerequisites given as an array of { value } objects', () => {
    const result = mapFeat(
      makeEntry({
        level: { value: 1 },
        category: 'skill',
        prerequisites: { value: [{ value: 'trained in Athletics' }] },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.prerequisites).toEqual(['trained in Athletics']);
    }
  });

  it('maps prerequisites given as a plain string array, as a fallback', () => {
    const result = mapFeat(
      makeEntry({
        level: { value: 1 },
        category: 'skill',
        prerequisites: { value: ['trained in Athletics'] },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.prerequisites).toEqual(['trained in Athletics']);
    }
  });

  it('carries rule elements through, inert ones included', () => {
    const result = mapFeat(
      makeEntry({
        level: { value: 1 },
        category: 'general',
        rules: [
          { key: 'RollOption', option: 'raging' },
          { key: 'ItemAlteration', mode: 'add' },
        ],
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.ruleElements).toEqual([
        { kind: 'rollOption', option: 'raging' },
        {
          kind: 'inert',
          upstreamKind: 'ItemAlteration',
          reason: 'unmapped-element-kind',
        },
      ]);
    }
  });

  it('derives the same id for the same upstream id, every time', () => {
    const a = mapFeat(
      makeEntry({ level: { value: 1 }, category: 'general' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    const b = mapFeat(
      makeEntry({ level: { value: 1 }, category: 'general' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(a.ok && b.ok && a.entry.id === b.entry.id).toBe(true);
  });
});

describe('mapFeat -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapFeat(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects a missing level', () => {
    expect(mapFeat(makeEntry({ category: 'general' }), PROVENANCE, IMPORTED_AT)).toEqual({
      ok: false,
      reason: 'missing-or-invalid-level',
    });
  });

  it('rejects level 0', () => {
    expect(
      mapFeat(
        makeEntry({ level: { value: 0 }, category: 'general' }),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({
      ok: false,
      reason: 'missing-or-invalid-level',
    });
  });

  it('rejects an unrecognized category', () => {
    expect(
      mapFeat(
        makeEntry({ level: { value: 1 }, category: 'racial' }),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({
      ok: false,
      reason: 'unrecognized-category',
    });
  });
});
