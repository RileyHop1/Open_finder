import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { mapAncestry } from './mapAncestry.js';
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
    path: 'ancestries/invented-folk.json',
    id: '1111111111111111',
    name: 'Invented Folk',
    type: 'ancestry',
    system,
    ...overrides,
  };
}

describe('mapAncestry -- success', () => {
  it('maps a human-shaped ancestry: no fixed boosts, two free boosts', () => {
    const result = mapAncestry(
      makeEntry({
        hp: 8,
        size: 'med',
        speed: 25,
        boosts: {
          '0': { value: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
          '1': { value: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
        },
        languages: { value: ['common', 'taldane'] },
        slug: 'invented-folk',
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('1111111111111111'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'ancestries',
        slug: 'invented-folk',
        name: 'Invented Folk',
        kind: 'ancestry',
        provenance: PROVENANCE,
        traits: [],
        ruleElements: [],
        description: '',
        hp: 8,
        size: 'medium',
        speed: 25,
        boosts: [],
        freeBoosts: 2,
        flaws: [],
        languages: ['common', 'taldane'],
      },
    });
  });

  it('maps an elf-shaped ancestry: fixed boosts plus one free boost', () => {
    const result = mapAncestry(
      makeEntry({
        hp: 6,
        size: 'med',
        speed: 30,
        boosts: {
          '0': { value: ['dex'] },
          '1': { value: ['int'] },
          '2': { value: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
        },
      }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.boosts.slice().sort()).toEqual(['dex', 'int']);
      expect(result.entry.freeBoosts).toBe(1);
    }
  });

  it.each([
    ['tiny', 'tiny'],
    ['sm', 'small'],
    ['med', 'medium'],
    ['lg', 'large'],
    ['huge', 'huge'],
    ['grg', 'gargantuan'],
  ] as const)('maps size code %s to %s', (code, expected) => {
    const result = mapAncestry(
      makeEntry({ hp: 8, size: code, speed: 25 }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.size).toBe(expected);
    }
  });

  it('defaults languages to an empty array when absent', () => {
    const result = mapAncestry(
      makeEntry({ hp: 8, size: 'med', speed: 25 }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.languages).toEqual([]);
    }
  });
});

describe('mapAncestry -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapAncestry(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects a missing or non-positive hp', () => {
    expect(
      mapAncestry(makeEntry({ size: 'med', speed: 25 }), PROVENANCE, IMPORTED_AT),
    ).toEqual({
      ok: false,
      reason: 'missing-or-invalid-hp',
    });
  });

  it('rejects an unrecognized size code', () => {
    expect(
      mapAncestry(
        makeEntry({ hp: 8, size: 'colossal', speed: 25 }),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'unrecognized-size' });
  });

  it('rejects a missing speed', () => {
    expect(
      mapAncestry(makeEntry({ hp: 8, size: 'med' }), PROVENANCE, IMPORTED_AT),
    ).toEqual({
      ok: false,
      reason: 'missing-or-invalid-speed',
    });
  });
});
