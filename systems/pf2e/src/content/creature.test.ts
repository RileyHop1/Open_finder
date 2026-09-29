import { describe, expect, it } from 'vitest';

import { creatureEntrySchema } from './creature.js';

// An invented monster, not a published stat block -- see the module doc
// and CLAUDE.md's Testing section on golden-creature fixtures.
function makeCreature(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'creatures',
    slug: 'quill-stalker',
    name: 'Quill Stalker',
    kind: 'creature',
    provenance: {
      publication: 'Pathfinder Monster Core',
      license: 'ORC',
      remaster: true,
    },
    level: 2,
    size: 'small',
    perception: 8,
    ac: 18,
    savingThrows: { fortitude: 7, reflex: 9, will: 5 },
    hp: 30,
    speeds: { land: 25 },
    attributes: { str: 2, dex: 4, con: 2, int: -3, wis: 1, cha: -1 },
    ...overrides,
  };
}

describe('creatureEntrySchema', () => {
  it('accepts a minimal well-formed creature, defaulting the optional collections', () => {
    const result = creatureEntrySchema.safeParse(makeCreature());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resistances).toEqual([]);
      expect(result.data.weaknesses).toEqual([]);
      expect(result.data.skills).toEqual({});
      expect(result.data.strikes).toEqual([]);
      expect(result.data.languages).toEqual([]);
    }
  });

  it('accepts a negative level (a level -1 creature)', () => {
    expect(creatureEntrySchema.safeParse(makeCreature({ level: -1 })).success).toBe(true);
  });

  it('accepts non-land speeds', () => {
    const result = creatureEntrySchema.safeParse(
      makeCreature({ speeds: { land: 25, fly: 40, climb: 10 } }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts skills as an open record keyed by slug', () => {
    const result = creatureEntrySchema.safeParse(
      makeCreature({ skills: { stealth: 9, 'wilderness-lore': 6 } }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts resistances and weaknesses, including non-damage-type entries', () => {
    const result = creatureEntrySchema.safeParse(
      makeCreature({
        resistances: [{ damageType: 'piercing', value: 5 }],
        weaknesses: [
          { damageType: 'fire', value: 10 },
          { damageType: 'precision', value: 3 },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a strike with a single damage component', () => {
    const result = creatureEntrySchema.safeParse(
      makeCreature({
        strikes: [
          {
            name: 'quills',
            attackBonus: 9,
            traits: ['agile', 'finesse'],
            damage: [{ diceNumber: 1, dieFaces: 6, bonus: 4, damageType: 'piercing' }],
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a strike with multiple damage components (a rider)', () => {
    const result = creatureEntrySchema.safeParse(
      makeCreature({
        strikes: [
          {
            name: 'venomous bite',
            attackBonus: 9,
            damage: [
              { diceNumber: 1, dieFaces: 8, bonus: 4, damageType: 'piercing' },
              { diceNumber: 1, dieFaces: 4, damageType: 'poison' },
            ],
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a strike with no damage components', () => {
    const result = creatureEntrySchema.safeParse(
      makeCreature({
        strikes: [{ name: 'harmless nudge', attackBonus: 0, damage: [] }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive ac or hp', () => {
    expect(creatureEntrySchema.safeParse(makeCreature({ ac: 0 })).success).toBe(false);
    expect(creatureEntrySchema.safeParse(makeCreature({ hp: 0 })).success).toBe(false);
  });

  it('rejects a level outside -1 to 30', () => {
    expect(creatureEntrySchema.safeParse(makeCreature({ level: -2 })).success).toBe(
      false,
    );
    expect(creatureEntrySchema.safeParse(makeCreature({ level: 31 })).success).toBe(
      false,
    );
  });

  it('rejects an invalid size', () => {
    expect(
      creatureEntrySchema.safeParse(makeCreature({ size: 'colossal' })).success,
    ).toBe(false);
  });
});
