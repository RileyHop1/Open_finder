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
        text: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'Useful.' }] }],
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

  it('maps price, bulk, and level when present', () => {
    const result = mapGear(
      makeEntry({
        price: { value: { sp: 5 } },
        bulk: { value: '-' },
        level: { value: 1 },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.priceInCopper).toBe(50);
      expect(result.entry.bulk).toBe(0);
      expect(result.entry.level).toBe(1);
    }
  });

  it('omits price, bulk, and level when absent, rather than defaulting them', () => {
    const result = mapGear(makeEntry({}), PROVENANCE, IMPORTED_AT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.priceInCopper).toBeUndefined();
      expect(result.entry.bulk).toBeUndefined();
      expect(result.entry.level).toBeUndefined();
    }
  });

  it('leaves consumable undefined for an ordinary equipment-type entry', () => {
    const result = mapGear(makeEntry({}), PROVENANCE, IMPORTED_AT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.consumable).toBeUndefined();
    }
  });

  it('maps a recognized consumable category for a consumable-type entry', () => {
    const result = mapGear(
      makeEntry({ consumableType: { value: 'potion' } }, { type: 'consumable' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.consumable).toEqual({ category: 'potion' });
    }
  });

  it("falls back to 'other' for an upstream consumable sub-type outside this project's categories", () => {
    const result = mapGear(
      makeEntry({ consumableType: { value: 'mutagen' } }, { type: 'consumable' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.consumable).toEqual({ category: 'other' });
    }
  });

  it('maps multi-use charges when current and max are both usable integers', () => {
    const result = mapGear(
      makeEntry(
        { consumableType: { value: 'wand' }, uses: { value: 1, max: 1 } },
        { type: 'consumable' },
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.consumable?.uses).toEqual({ current: 1, max: 1 });
    }
  });

  it('omits uses (single-use) when max is absent, zero, or current exceeds max', () => {
    const noUses = mapGear(
      makeEntry({ consumableType: { value: 'potion' } }, { type: 'consumable' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    const zeroMax = mapGear(
      makeEntry(
        { consumableType: { value: 'wand' }, uses: { value: 0, max: 0 } },
        { type: 'consumable' },
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    const overMax = mapGear(
      makeEntry(
        { consumableType: { value: 'wand' }, uses: { value: 5, max: 1 } },
        { type: 'consumable' },
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    for (const result of [noUses, zeroMax, overMax]) {
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.entry.consumable?.uses).toBeUndefined();
      }
    }
  });

  it('leaves consumable.spell undefined -- a later PR resolves it against the full entry set', () => {
    const result = mapGear(
      makeEntry({ consumableType: { value: 'scroll' } }, { type: 'consumable' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.consumable?.spell).toBeUndefined();
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
