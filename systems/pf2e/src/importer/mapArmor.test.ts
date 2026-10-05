import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { mapArmor } from './mapArmor.js';
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
    path: 'equipment/invented-armor.json',
    id: 'dddddddddddddddd',
    name: 'Invented Armor',
    type: 'armor',
    system,
    ...overrides,
  };
}

describe('mapArmor -- success', () => {
  it('maps a well-formed light armor', () => {
    const result = mapArmor(
      makeEntry({
        category: 'light',
        group: 'chain',
        acBonus: 2,
        slug: 'invented-armor',
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('dddddddddddddddd'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'equipment',
        slug: 'invented-armor',
        name: 'Invented Armor',
        kind: 'armor',
        provenance: PROVENANCE,
        traits: [],
        ruleElements: [],
        description: '',
        text: [],
        category: 'light',
        group: 'chain',
        acBonus: 2,
        checkPenalty: 0,
        speedPenalty: 0,
      },
    });
  });

  it('maps heavy armor with a dex cap of 0 -- a real, meaningful value, not "uncapped"', () => {
    const result = mapArmor(
      makeEntry({
        category: 'heavy',
        group: 'plate',
        acBonus: 6,
        dexCap: 0,
        checkPenalty: -3,
        speedPenalty: -10,
        strength: 18,
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.dexCap).toBe(0);
      expect(result.entry.checkPenalty).toBe(-3);
      expect(result.entry.speedPenalty).toBe(-10);
      expect(result.entry.strength).toBe(18);
    }
  });

  it('omits strength when it is 0 -- upstream uses 0 to mean "no requirement"', () => {
    const result = mapArmor(
      makeEntry({ category: 'light', group: 'cloth', acBonus: 1, strength: 0 }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.strength).toBeUndefined();
    }
  });

  it('accepts unarmored armor with no group at all', () => {
    const result = mapArmor(
      makeEntry({ category: 'unarmored', acBonus: 0 }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.group).toBeUndefined();
    }
  });
});

describe('mapArmor -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapArmor(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects an unrecognized category', () => {
    expect(
      mapArmor(makeEntry({ category: 'exotic', acBonus: 1 }), PROVENANCE, IMPORTED_AT),
    ).toEqual({ ok: false, reason: 'unrecognized-category' });
  });

  it('rejects a missing acBonus', () => {
    expect(mapArmor(makeEntry({ category: 'light' }), PROVENANCE, IMPORTED_AT)).toEqual({
      ok: false,
      reason: 'missing-or-invalid-ac-bonus',
    });
  });

  it('rejects an unrecognized group when one is present', () => {
    expect(
      mapArmor(
        makeEntry({ category: 'light', group: 'silk', acBonus: 1 }),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'unrecognized-group' });
  });
});
