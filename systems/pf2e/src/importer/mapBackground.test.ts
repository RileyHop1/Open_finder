import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { mapBackground } from './mapBackground.js';
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
    path: 'backgrounds/invented-warrior.json',
    id: '3333333333333333',
    name: 'Invented Warrior',
    type: 'background',
    system,
    ...overrides,
  };
}

function baseSystem(overrides: Record<string, unknown> = {}) {
  return {
    boosts: {
      '0': { value: ['str', 'con'] },
      '1': { value: ['str', 'dex', 'con', 'int', 'wis', 'cha'] },
    },
    trainedSkills: { value: ['athletics'] },
    ...overrides,
  };
}

describe('mapBackground -- success', () => {
  it('maps a well-formed background', () => {
    const result = mapBackground(
      makeEntry({ ...baseSystem(), slug: 'invented-warrior' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('3333333333333333'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'backgrounds',
        slug: 'invented-warrior',
        name: 'Invented Warrior',
        kind: 'background',
        provenance: PROVENANCE,
        traits: [],
        ruleElements: [],
        description: '',
        boostOptions: ['str', 'con'],
        trainedSkills: ['athletics'],
      },
    });
  });

  it('extracts the constrained boost slot, not the universal free one', () => {
    const result = mapBackground(makeEntry(baseSystem()), PROVENANCE, IMPORTED_AT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.boostOptions).toEqual(['str', 'con']);
    }
  });

  it('carries the granted skill feat through as an ordinary grantItem rule element', () => {
    const result = mapBackground(
      makeEntry(
        baseSystem({
          rules: [
            { key: 'GrantItem', uuid: 'Compendium.pf2e.feats.Item.aaaaaaaaaaaaaaaa' },
          ],
        }),
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.ruleElements).toEqual([
        {
          kind: 'unresolvedGrantItem',
          uuid: 'Compendium.pf2e.feats.Item.aaaaaaaaaaaaaaaa',
        },
      ]);
    }
  });
});

describe('mapBackground -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapBackground(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects a missing boosts structure', () => {
    expect(
      mapBackground(
        makeEntry({ trainedSkills: { value: ['athletics'] } }),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-boost-options' });
  });

  it('rejects missing trained skills', () => {
    expect(
      mapBackground(makeEntry({ boosts: baseSystem().boosts }), PROVENANCE, IMPORTED_AT),
    ).toEqual({ ok: false, reason: 'missing-trained-skills' });
  });
});
