import { describe, expect, it } from 'vitest';

import { mapHeritage } from './mapHeritage.js';
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
    path: 'heritages/invented-heritage.json',
    id: '2222222222222222',
    name: 'Invented Heritage',
    type: 'heritage',
    system,
    ...overrides,
  };
}

describe('mapHeritage -- success', () => {
  it('maps a heritage with a plain string ancestry reference', () => {
    const result = mapHeritage(
      makeEntry({ ancestry: 'invented-folk' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.ancestrySlug).toBe('invented-folk');
    }
  });

  it('maps a heritage with an object ancestry reference carrying a slug', () => {
    const result = mapHeritage(
      makeEntry({ ancestry: { slug: 'invented-folk', name: 'Invented Folk' } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.ancestrySlug).toBe('invented-folk');
    }
  });

  it('falls back to a slugified name when only a name is present', () => {
    const result = mapHeritage(
      makeEntry({ ancestry: { name: 'Invented Folk' } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.ancestrySlug).toBe('invented-folk');
    }
  });

  it('is confidently versatile when the ancestry reference is entirely absent', () => {
    const result = mapHeritage(makeEntry({}), PROVENANCE, IMPORTED_AT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.ancestrySlug).toBeUndefined();
    }
  });
});

describe('mapHeritage -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapHeritage(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects an ancestry reference that is present but unparseable, rather than silently treating it as versatile', () => {
    const result = mapHeritage(
      makeEntry({ ancestry: { uuid: 'Compendium.pf2e.ancestries.Item.xxxx' } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({ ok: false, reason: 'unparseable-ancestry-reference' });
  });

  it('rejects a numeric ancestry reference', () => {
    expect(mapHeritage(makeEntry({ ancestry: 5 }), PROVENANCE, IMPORTED_AT)).toEqual({
      ok: false,
      reason: 'unparseable-ancestry-reference',
    });
  });
});
