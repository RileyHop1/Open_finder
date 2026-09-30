import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { mapSpell } from './mapSpell.js';
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
    path: 'spells/invented-bolt.json',
    id: 'ffffffffffffffff',
    name: 'Invented Bolt',
    type: 'spell',
    system,
    ...overrides,
  };
}

function baseSystem(overrides: Record<string, unknown> = {}) {
  return {
    level: { value: 1 },
    time: { value: '2' },
    range: { value: '120 feet' },
    ...overrides,
  };
}

describe('mapSpell -- success', () => {
  it('maps a well-formed spell', () => {
    const result = mapSpell(
      makeEntry({
        ...baseSystem(),
        traditions: { value: ['arcane', 'occult'] },
        slug: 'invented-bolt',
        description: { value: '<p>Zap.</p>' },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('ffffffffffffffff'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'spells',
        slug: 'invented-bolt',
        name: 'Invented Bolt',
        kind: 'spell',
        provenance: PROVENANCE,
        traits: [],
        ruleElements: [],
        description: '<p>Zap.</p>',
        rank: 1,
        traditions: ['arcane', 'occult'],
        castTime: 'two',
        range: { kind: 'feet', value: 120 },
        sustained: false,
      },
    });
  });

  it.each([
    ['touch', { kind: 'touch' }],
    ['self', { kind: 'self' }],
    ['unlimited', { kind: 'unlimited' }],
    ['30 feet', { kind: 'feet', value: 30 }],
    ['1 foot', { kind: 'feet', value: 1 }],
    // Real upstream data (Create Water) encodes touch range this way
    // instead of the string "touch" -- see mapRange's own doc comment.
    ['0 feet', { kind: 'touch' }],
  ] as const)('parses range %s', (rangeValue, expected) => {
    const result = mapSpell(
      makeEntry(baseSystem({ range: { value: rangeValue } })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.range).toEqual(expected);
    }
  });

  it.each([
    ['1', 'one'],
    ['2', 'two'],
    ['3', 'three'],
    ['reaction', 'reaction'],
    ['free', 'free'],
  ] as const)('translates cast time %s to %s', (timeValue, expected) => {
    const result = mapSpell(
      makeEntry(baseSystem({ time: { value: timeValue } })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.castTime).toBe(expected);
    }
  });

  it('passes through a non-standard cast time unchanged', () => {
    const result = mapSpell(
      makeEntry(baseSystem({ time: { value: '10 minutes' } })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.castTime).toBe('10 minutes');
    }
  });

  it('maps an area', () => {
    const result = mapSpell(
      makeEntry(baseSystem({ area: { value: 20, type: 'burst' } })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.area).toEqual({ shape: 'burst', size: 20 });
    }
  });

  it('marks a spell sustained via the sustained trait, not a separate field', () => {
    const result = mapSpell(
      makeEntry(baseSystem({ traits: { value: ['sustained', 'concentrate'] } })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.sustained).toBe(true);
      expect(result.entry.traits).toEqual(['sustained', 'concentrate']);
    }
  });

  it('maps a basic reflex save defense', () => {
    const result = mapSpell(
      makeEntry(baseSystem({ defense: { save: { statistic: 'reflex', basic: true } } })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.defense).toEqual({ save: 'reflex', basic: true });
    }
  });

  it('omits heightening entirely, deliberately, even when upstream has one', () => {
    const result = mapSpell(
      makeEntry(baseSystem({ heightening: { type: 'interval', interval: 1 } })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.heightening).toBeUndefined();
    }
  });

  it('derives a slug from the name when system.slug is absent', () => {
    const result = mapSpell(makeEntry(baseSystem()), PROVENANCE, IMPORTED_AT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.slug).toBe('invented-bolt');
    }
  });
});

describe('mapSpell -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapSpell(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects a missing or out-of-range rank', () => {
    expect(
      mapSpell(makeEntry(baseSystem({ level: undefined })), PROVENANCE, IMPORTED_AT),
    ).toEqual({
      ok: false,
      reason: 'missing-or-invalid-rank',
    });
    expect(
      mapSpell(makeEntry(baseSystem({ level: { value: 11 } })), PROVENANCE, IMPORTED_AT),
    ).toEqual({
      ok: false,
      reason: 'missing-or-invalid-rank',
    });
  });

  it('rejects a missing cast time', () => {
    expect(
      mapSpell(makeEntry(baseSystem({ time: undefined })), PROVENANCE, IMPORTED_AT),
    ).toEqual({
      ok: false,
      reason: 'missing-cast-time',
    });
  });

  it('rejects an unparseable range', () => {
    expect(
      mapSpell(
        makeEntry(baseSystem({ range: { value: 'a very long way' } })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'unparseable-range' });
  });
});
