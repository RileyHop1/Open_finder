import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { mapGear } from './mapGear.js';
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
    path: 'equipment/invented-gear.json',
    id: 'eeeeeeeeeeeeeeee',
    name: 'Invented Gear',
    type: 'equipment',
    system,
    ...overrides,
  };
}

describe('mapGear -- success', () => {
  it('maps a well-formed gear entry', () => {
    const result = mapGear(
      makeEntry({ slug: 'invented-gear', description: { value: '<p>Useful.</p>' } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('eeeeeeeeeeeeeeee'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'equipment',
        slug: 'invented-gear',
        name: 'Invented Gear',
        kind: 'gear',
        provenance: PROVENANCE,
        traits: [],
        ruleElements: [],
        description: '<p>Useful.</p>',
      },
    });
  });

  it('carries rule elements through (e.g. a wand granting a spell)', () => {
    const result = mapGear(
      makeEntry({
        rules: [
          { key: 'GrantItem', uuid: 'Compendium.pf2e.spells.Item.aaaaaaaaaaaaaaaa' },
        ],
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.ruleElements).toEqual([
        {
          kind: 'unresolvedGrantItem',
          uuid: 'Compendium.pf2e.spells.Item.aaaaaaaaaaaaaaaa',
        },
      ]);
    }
  });

  it('derives a slug from the name when system.slug is absent', () => {
    const result = mapGear(makeEntry({}), PROVENANCE, IMPORTED_AT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.slug).toBe('invented-gear');
    }
  });
});

describe('mapGear -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapGear(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });
});
