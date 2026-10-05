import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { mapWeapon } from './mapWeapon.js';
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
    path: 'equipment/invented-sword.json',
    id: 'cccccccccccccccc',
    name: 'Invented Sword',
    type: 'weapon',
    system,
    ...overrides,
  };
}

function baseSystem(overrides: Record<string, unknown> = {}) {
  return {
    category: 'martial',
    group: 'sword',
    damage: { dice: 1, die: 'd8', damageType: 'slashing' },
    ...overrides,
  };
}

describe('mapWeapon -- success', () => {
  it('maps a well-formed one-handed melee weapon', () => {
    const result = mapWeapon(
      makeEntry({
        ...baseSystem(),
        slug: 'invented-sword',
        description: { value: '<p>Sharp.</p>' },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('cccccccccccccccc'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'equipment',
        slug: 'invented-sword',
        name: 'Invented Sword',
        kind: 'weapon',
        provenance: PROVENANCE,
        traits: [],
        ruleElements: [],
        description: '<p>Sharp.</p>',
        text: [{ kind: 'paragraph', children: [{ kind: 'text', value: 'Sharp.' }] }],
        category: 'martial',
        group: 'sword',
        damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
        hands: 1,
      },
    });
  });

  it('maps a two-handed weapon via usage.value', () => {
    const result = mapWeapon(
      makeEntry({ ...baseSystem(), usage: { value: 'held-in-two-hands' } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.hands).toBe(2);
    }
  });

  it('maps a ranged weapon with range and reload', () => {
    const result = mapWeapon(
      makeEntry({
        category: 'martial',
        group: 'firearm',
        damage: { dice: 1, die: 'd8', damageType: 'piercing' },
        range: 120,
        reload: { value: '1' },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.range).toBe(120);
      expect(result.entry.reload).toBe(1);
    }
  });

  it('omits reload when its value is "-" (no reload step)', () => {
    const result = mapWeapon(
      makeEntry({ ...baseSystem(), range: 20, reload: { value: '-' } }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.reload).toBeUndefined();
    }
  });

  it('derives a slug from the name when system.slug is absent', () => {
    const result = mapWeapon(makeEntry(baseSystem()), PROVENANCE, IMPORTED_AT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.slug).toBe('invented-sword');
    }
  });

  it('maps price, bulk, and level when present', () => {
    const result = mapWeapon(
      makeEntry({
        ...baseSystem(),
        price: { value: { gp: 1, sp: 5 } },
        bulk: { value: '1' },
        level: { value: 0 },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.priceInCopper).toBe(150);
      expect(result.entry.bulk).toBe(1);
      expect(result.entry.level).toBe(0);
    }
  });

  it('omits price, bulk, and level when absent, rather than defaulting them', () => {
    const result = mapWeapon(makeEntry(baseSystem()), PROVENANCE, IMPORTED_AT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.priceInCopper).toBeUndefined();
      expect(result.entry.bulk).toBeUndefined();
      expect(result.entry.level).toBeUndefined();
    }
  });
});

describe('mapWeapon -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapWeapon(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects an unrecognized category', () => {
    expect(
      mapWeapon(makeEntry(baseSystem({ category: 'exotic' })), PROVENANCE, IMPORTED_AT),
    ).toEqual({
      ok: false,
      reason: 'unrecognized-category',
    });
  });

  it('rejects an unrecognized group', () => {
    expect(
      mapWeapon(makeEntry(baseSystem({ group: 'wand' })), PROVENANCE, IMPORTED_AT),
    ).toEqual({
      ok: false,
      reason: 'unrecognized-group',
    });
  });

  it('rejects an unsupported die size', () => {
    expect(
      mapWeapon(
        makeEntry(
          baseSystem({ damage: { dice: 1, die: 'd20', damageType: 'slashing' } }),
        ),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'unsupported-die-size' });
  });

  it('rejects an energy damage type -- a weapon base type is always physical', () => {
    expect(
      mapWeapon(
        makeEntry(baseSystem({ damage: { dice: 1, die: 'd6', damageType: 'fire' } })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'unrecognized-damage-type' });
  });

  it('rejects a missing damage block', () => {
    expect(
      mapWeapon(
        makeEntry({ category: 'martial', group: 'sword' }),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-damage-dice' });
  });
});
