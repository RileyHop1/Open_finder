import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { mapClass } from './mapClass.js';
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
    path: 'classes/invented-vanguard.json',
    id: '4444444444444444',
    name: 'Invented Vanguard',
    type: 'class',
    system,
    ...overrides,
  };
}

function baseSystem(overrides: Record<string, unknown> = {}) {
  return {
    keyAbility: { value: ['str'] },
    hp: 10,
    perception: { trained: 1 },
    savingThrows: {
      fortitude: { trained: 1, expert: 5 },
      reflex: { trained: 1 },
      will: { trained: 1, expert: 3 },
    },
    classDC: { trained: 1 },
    weapons: {
      unarmed: { trained: 1 },
      simple: { trained: 1 },
      martial: { trained: 1, expert: 5 },
      advanced: {},
    },
    armor: {
      unarmored: { trained: 1 },
      light: { trained: 1 },
      medium: { trained: 1, expert: 13 },
      heavy: {},
    },
    trainedSkills: { value: ['athletics'], additional: 3 },
    ...overrides,
  };
}

describe('mapClass -- success', () => {
  it('maps a well-formed class', () => {
    const result = mapClass(
      makeEntry({ ...baseSystem(), slug: 'invented-vanguard' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('4444444444444444'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'classes',
        slug: 'invented-vanguard',
        name: 'Invented Vanguard',
        kind: 'class',
        provenance: PROVENANCE,
        traits: [],
        ruleElements: [],
        description: '',
        keyAttributeOptions: ['str'],
        hpPerLevel: 10,
        proficiencies: {
          perception: { trained: 1 },
          savingThrows: {
            fortitude: { trained: 1, expert: 5 },
            reflex: { trained: 1 },
            will: { trained: 1, expert: 3 },
          },
          classDc: { trained: 1 },
          weapons: {
            unarmed: { trained: 1 },
            simple: { trained: 1 },
            martial: { trained: 1, expert: 5 },
            advanced: {},
          },
          armor: {
            unarmored: { trained: 1 },
            light: { trained: 1 },
            medium: { trained: 1, expert: 13 },
            heavy: {},
          },
        },
        skills: { trainedSkillCount: 3, automaticallyTrained: ['athletics'] },
      },
    });
  });

  it('accepts more than one key attribute option, for a choice-of-key-ability class', () => {
    const result = mapClass(
      makeEntry(baseSystem({ keyAbility: { value: ['str', 'dex'] } })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.keyAttributeOptions).toEqual(['str', 'dex']);
    }
  });
});

describe('mapClass -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapClass(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects a missing key attribute', () => {
    expect(
      mapClass(makeEntry(baseSystem({ keyAbility: undefined })), PROVENANCE, IMPORTED_AT),
    ).toEqual({ ok: false, reason: 'missing-key-attribute-options' });
  });

  it('rejects a missing or non-positive hp', () => {
    expect(mapClass(makeEntry(baseSystem({ hp: 0 })), PROVENANCE, IMPORTED_AT)).toEqual({
      ok: false,
      reason: 'missing-or-invalid-hp',
    });
  });

  it('rejects a proficiency progression where a higher rank is reached before a lower one', () => {
    expect(
      mapClass(
        makeEntry(baseSystem({ classDC: { trained: 5, expert: 3 } })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'invalid-proficiency-progression' });
  });

  it('rejects a missing trained skill count', () => {
    expect(
      mapClass(
        makeEntry(baseSystem({ trainedSkills: { value: ['athletics'] } })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-trained-skill-count' });
  });
});
