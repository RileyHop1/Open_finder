import { describe, expect, it } from 'vitest';

import { deterministicId } from './deterministicId.js';
import { mapCreature } from './mapCreature.js';
import type { UpstreamEntry } from './reader.js';

// Synthetic, invented upstream-shaped fixtures throughout (ADR 0013) --
// never a real published stat block (ADR 0003's consequences).
const PROVENANCE = {
  publication: 'Pathfinder Monster Core',
  license: 'ORC' as const,
  remaster: true as const,
};
const IMPORTED_AT = '2026-09-29T00:00:00.000Z';

const CLAW_STRIKE = {
  name: 'Invented Claw',
  type: 'melee',
  system: {
    bonus: { value: 12 },
    traits: { value: ['agile'] },
    damageRolls: {
      a: { dice: 2, die: 'd6', bonus: 4, damageType: 'slashing' },
    },
  },
};

function makeEntry(
  system: Record<string, unknown>,
  overrides: Partial<UpstreamEntry> = {},
): UpstreamEntry {
  return {
    path: 'creatures/invented-drake.json',
    id: '6666666666666666',
    name: 'Invented Drake',
    type: 'npc',
    system,
    items: [CLAW_STRIKE],
    ...overrides,
  };
}

function baseSystem(overrides: Record<string, unknown> = {}) {
  return {
    details: { level: { value: 3 }, languages: { value: ['common'] } },
    traits: { value: ['dragon'], size: { value: 'lg' } },
    perception: { mod: 10 },
    attributes: {
      ac: { value: 22 },
      hp: { value: 45 },
      speed: { value: 25, otherSpeeds: [{ type: 'fly', value: 50 }] },
      resistances: [{ type: 'fire', value: 5 }],
      weaknesses: [{ type: 'cold', value: 5 }],
    },
    saves: {
      fortitude: { value: 12 },
      reflex: { value: 8 },
      will: { value: 9 },
    },
    abilities: {
      str: { mod: 5 },
      dex: { mod: 2 },
      con: { mod: 4 },
      int: { mod: -1 },
      wis: { mod: 1 },
      cha: { mod: 0 },
    },
    skills: { athletics: { base: 13 } },
    ...overrides,
  };
}

describe('mapCreature -- success', () => {
  it('maps a well-formed creature', () => {
    const result = mapCreature(
      makeEntry({ ...baseSystem(), slug: 'invented-drake' }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: deterministicId('6666666666666666'),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'creatures',
        slug: 'invented-drake',
        name: 'Invented Drake',
        kind: 'creature',
        provenance: PROVENANCE,
        traits: ['dragon'],
        ruleElements: [],
        description: '',
        level: 3,
        size: 'large',
        perception: 10,
        ac: 22,
        savingThrows: { fortitude: 12, reflex: 8, will: 9 },
        hp: 45,
        resistances: [{ damageType: 'fire', value: 5 }],
        weaknesses: [{ damageType: 'cold', value: 5 }],
        speeds: { land: 25, fly: 50 },
        attributes: { str: 5, dex: 2, con: 4, int: -1, wis: 1, cha: 0 },
        skills: { athletics: 13 },
        strikes: [
          {
            name: 'Invented Claw',
            attackBonus: 12,
            traits: ['agile'],
            damage: [{ diceNumber: 2, dieFaces: 6, bonus: 4, damageType: 'slashing' }],
          },
        ],
        languages: ['common'],
      },
    });
  });

  it('allows a creature with no strikes at all', () => {
    const result = mapCreature(
      makeEntry(baseSystem(), { items: [] }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.strikes).toEqual([]);
    }
  });

  it('ignores embedded items that are not melee-type', () => {
    const result = mapCreature(
      makeEntry(baseSystem(), { items: [{ name: 'A Longsword', type: 'weapon' }] }),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.strikes).toEqual([]);
    }
  });

  it('accepts a level of -1, the weakest creatures in the game', () => {
    const result = mapCreature(
      makeEntry(baseSystem({ details: { level: { value: -1 } } })),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.level).toBe(-1);
    }
  });

  it('drops a malformed resistance entry rather than failing the whole creature', () => {
    const result = mapCreature(
      makeEntry(
        baseSystem({
          attributes: {
            ...baseSystem().attributes,
            resistances: [{ type: 'fire', value: 5 }, { type: 'not a number' }],
          },
        }),
      ),
      PROVENANCE,
      IMPORTED_AT,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.resistances).toEqual([{ damageType: 'fire', value: 5 }]);
    }
  });
});

describe('mapCreature -- fails closed', () => {
  it('rejects a malformed (non-object) system', () => {
    expect(
      mapCreature(
        makeEntry(null as unknown as Record<string, unknown>),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'malformed-system' });
  });

  it('rejects a missing or invalid level', () => {
    expect(
      mapCreature(makeEntry(baseSystem({ details: {} })), PROVENANCE, IMPORTED_AT),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-level' });
  });

  it('rejects an unrecognized size code', () => {
    expect(
      mapCreature(
        makeEntry(baseSystem({ traits: { value: [], size: { value: 'xl' } } })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'unrecognized-size' });
  });

  it('rejects a missing perception modifier', () => {
    expect(
      mapCreature(makeEntry(baseSystem({ perception: {} })), PROVENANCE, IMPORTED_AT),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-perception' });
  });

  it('rejects a missing or non-positive AC', () => {
    expect(
      mapCreature(
        makeEntry(
          baseSystem({ attributes: { ...baseSystem().attributes, ac: { value: 0 } } }),
        ),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-ac' });
  });

  it('rejects incomplete saving throws', () => {
    expect(
      mapCreature(
        makeEntry(baseSystem({ saves: { fortitude: { value: 12 } } })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-saving-throws' });
  });

  it('rejects a missing or non-positive hp', () => {
    expect(
      mapCreature(
        makeEntry(
          baseSystem({ attributes: { ...baseSystem().attributes, hp: { value: 0 } } }),
        ),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-hp' });
  });

  it('rejects a missing land speed', () => {
    expect(
      mapCreature(
        makeEntry(baseSystem({ attributes: { ...baseSystem().attributes, speed: {} } })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-speed' });
  });

  it('rejects incomplete attribute modifiers', () => {
    expect(
      mapCreature(
        makeEntry(baseSystem({ abilities: { str: { mod: 5 } } })),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'missing-or-invalid-attributes' });
  });

  it('rejects an unparseable embedded strike (missing attack bonus)', () => {
    expect(
      mapCreature(
        makeEntry(baseSystem(), {
          items: [{ name: 'Invented Bite', type: 'melee', system: {} }],
        }),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'unparseable-strike' });
  });

  it('rejects an unparseable embedded strike (unsupported damage die size)', () => {
    expect(
      mapCreature(
        makeEntry(baseSystem(), {
          items: [
            {
              name: 'Invented Bite',
              type: 'melee',
              system: {
                bonus: { value: 10 },
                damageRolls: { a: { dice: 1, die: 'd20', damageType: 'piercing' } },
              },
            },
          ],
        }),
        PROVENANCE,
        IMPORTED_AT,
      ),
    ).toEqual({ ok: false, reason: 'unparseable-strike' });
  });
});
