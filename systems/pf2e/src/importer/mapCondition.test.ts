import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { mapCondition } from './mapCondition.js';
import type { UpstreamEntry } from './reader.js';

// Synthetic, invented upstream-shaped fixtures throughout (ADR 0013) --
// modeled loosely after real conditions but never copied from the book.
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
    path: 'conditions/invented-dazed.json',
    id: '7777777777777777',
    name: 'Invented Dazed',
    type: 'condition',
    system,
    ...overrides,
  };
}

describe('mapCondition -- success', () => {
  it('maps a well-formed valued condition with a max, group, and overrides', () => {
    const result = mapCondition(
      makeEntry({
        slug: 'invented-dazed',
        value: { isValued: true, max: 4 },
        group: 'detection',
        overrides: ['invented-mild-dazed'],
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('7777777777777777'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'conditions',
        slug: 'invented-dazed',
        name: 'Invented Dazed',
        kind: 'condition',
        provenance: PROVENANCE,
        traits: [],
        ruleElements: [],
        description: '',
        valued: true,
        maxValue: 4,
        group: 'detection',
        overrides: ['invented-mild-dazed'],
      },
    });
  });

  it('maps a well-formed binary condition with no max, group, or overrides', () => {
    const result = mapCondition(
      makeEntry({ value: { isValued: false } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('7777777777777777'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'conditions',
        slug: 'invented-dazed',
        name: 'Invented Dazed',
        kind: 'condition',
        provenance: PROVENANCE,
        traits: [],
        ruleElements: [],
        description: '',
        valued: false,
        overrides: [],
      },
    });
  });

  it('ignores a max value on a binary condition rather than carrying it through', () => {
    const result = mapCondition(
      makeEntry({ value: { isValued: false, max: 4 } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.maxValue).toBeUndefined();
    }
  });

  it('drops a non-string entry from overrides rather than failing the whole condition', () => {
    const result = mapCondition(
      makeEntry({ value: { isValued: false }, overrides: ['valid-slug', 5, ''] }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.overrides).toEqual(['valid-slug']);
    }
  });
});

describe('mapCondition -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapCondition(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects a missing valued flag', () => {
    expect(mapCondition(makeEntry({}), PROVENANCE, IMPORTED_AT)).toEqual({
      ok: false,
      reason: 'missing-or-invalid-valued-flag',
    });
  });

  it('rejects a non-boolean valued flag', () => {
    expect(
      mapCondition(makeEntry({ value: { isValued: 'yes' } }), PROVENANCE, IMPORTED_AT),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-valued-flag' });
  });
});
