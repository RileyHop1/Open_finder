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
    perception: 2,
    savingThrows: { fortitude: 2, reflex: 1, will: 1 },
    classDC: null,
    attacks: {
      unarmed: 1,
      simple: 1,
      martial: 2,
      advanced: 0,
      other: { name: '', rank: 0 },
    },
    defenses: { unarmored: 1, light: 1, medium: 1, heavy: 0 },
    trainedSkills: { value: ['athletics'], additional: 3 },
    ancestryFeatLevels: { value: [1, 5, 9, 13, 17] },
    classFeatLevels: { value: [1, 2, 4] },
    generalFeatLevels: { value: [3, 7] },
    skillFeatLevels: { value: [2, 4] },
    skillIncreaseLevels: { value: [3, 5] },
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
        text: [],
        keyAttributeOptions: ['str'],
        hpPerLevel: 10,
        proficiencies: {
          perception: { expert: 1 },
          savingThrows: {
            fortitude: { expert: 1 },
            reflex: { trained: 1 },
            will: { trained: 1 },
          },
          // Upstream's classDC is null; every class is trained in its class DC.
          classDc: { trained: 1 },
          weapons: {
            unarmed: { trained: 1 },
            simple: { trained: 1 },
            martial: { expert: 1 },
            advanced: {},
          },
          armor: {
            unarmored: { trained: 1 },
            light: { trained: 1 },
            medium: { trained: 1 },
            heavy: {},
          },
        },
        skills: { trainedSkillCount: 3, automaticallyTrained: ['athletics'] },
        advancement: {
          ancestryFeatLevels: [1, 5, 9, 13, 17],
          classFeatLevels: [1, 2, 4],
          generalFeatLevels: [3, 7],
          skillFeatLevels: [2, 4],
          skillIncreaseLevels: [3, 5],
        },
      },
    });
  });

  it('reads untrained as an empty progression and each higher rank as reached at level 1', () => {
    const result = mapClass(
      makeEntry(
        baseSystem({
          perception: 0,
          attacks: { unarmed: 1, simple: 1, martial: 3, advanced: 4 },
        }),
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.proficiencies.perception).toEqual({});
      expect(result.entry.proficiencies.weapons.martial).toEqual({ master: 1 });
      expect(result.entry.proficiencies.weapons.advanced).toEqual({ legendary: 1 });
    }
  });

  it('uses a numeric upstream class DC if one ever appears', () => {
    const result = mapClass(
      makeEntry(baseSystem({ classDC: 2 })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok && result.entry.proficiencies.classDc).toEqual({ expert: 1 });
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

  it('rejects a rank that is not a number from 0 to 4, rather than importing it as untrained', () => {
    for (const bad of [5, -1, 1.5, '2', undefined, { trained: 1 }]) {
      expect(
        mapClass(makeEntry(baseSystem({ perception: bad })), PROVENANCE, IMPORTED_AT),
      ).toEqual({ ok: false, reason: 'invalid-proficiency-progression' });
    }
  });

  it('rejects a class whose proficiency data is entirely missing (the old guessed shape)', () => {
    const empty = baseSystem({
      perception: undefined,
      savingThrows: undefined,
      attacks: undefined,
      defenses: undefined,
    });
    expect(mapClass(makeEntry(empty), PROVENANCE, IMPORTED_AT)).toEqual({
      ok: false,
      reason: 'invalid-proficiency-progression',
    });
  });

  it('rejects a class with no trained save at all', () => {
    expect(
      mapClass(
        makeEntry(baseSystem({ savingThrows: { fortitude: 0, reflex: 0, will: 0 } })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'invalid-proficiency-progression' });
  });

  it('rejects a missing or malformed advancement list', () => {
    for (const field of [
      'ancestryFeatLevels',
      'classFeatLevels',
      'generalFeatLevels',
      'skillFeatLevels',
      'skillIncreaseLevels',
    ]) {
      for (const bad of [undefined, { value: [] }, { value: [0] }, { value: [21] }]) {
        expect(
          mapClass(makeEntry(baseSystem({ [field]: bad })), PROVENANCE, IMPORTED_AT),
        ).toEqual({ ok: false, reason: 'missing-advancement-levels' });
      }
    }
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
