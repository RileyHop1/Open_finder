import { describe, expect, it } from 'vitest';

import { MAGICAL_TRADITIONS, SPELL_SAVES, spellEntrySchema } from './spell.js';

function makeSpell(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'spells',
    slug: 'magic-missile',
    name: 'Magic Missile',
    kind: 'spell',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    rank: 1,
    traditions: ['arcane', 'occult'],
    castTime: 'two',
    range: { kind: 'feet', value: 120 },
    ...overrides,
  };
}

describe('spellEntrySchema', () => {
  it('accepts a minimal well-formed spell, defaulting sustained and traditions', () => {
    const result = spellEntrySchema.safeParse(makeSpell({ traditions: [] }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sustained).toBe(false);
      expect(result.data.area).toBeUndefined();
      expect(result.data.defense).toBeUndefined();
      expect(result.data.heightening).toBeUndefined();
    }
  });

  it.each(MAGICAL_TRADITIONS)('accepts the %s tradition', (tradition) => {
    expect(
      spellEntrySchema.safeParse(makeSpell({ traditions: [tradition] })).success,
    ).toBe(true);
  });

  it('accepts an empty traditions array -- a focus spell tied to a class, not a tradition', () => {
    expect(spellEntrySchema.safeParse(makeSpell({ traditions: [] })).success).toBe(true);
  });

  it('accepts every range kind', () => {
    for (const range of [
      { kind: 'self' },
      { kind: 'touch' },
      { kind: 'feet', value: 30 },
      { kind: 'unlimited' },
    ]) {
      expect(spellEntrySchema.safeParse(makeSpell({ range })).success).toBe(true);
    }
  });

  it('rejects a feet range with no value', () => {
    expect(
      spellEntrySchema.safeParse(makeSpell({ range: { kind: 'feet' } })).success,
    ).toBe(false);
  });

  it('accepts a spell with an area', () => {
    const result = spellEntrySchema.safeParse(
      makeSpell({
        slug: 'fireball',
        name: 'Fireball',
        area: { shape: 'burst', size: 20 },
      }),
    );
    expect(result.success).toBe(true);
  });

  it.each(SPELL_SAVES)('accepts a basic %s save', (save) => {
    const result = spellEntrySchema.safeParse(
      makeSpell({ defense: { save, basic: true } }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts interval heightening', () => {
    const result = spellEntrySchema.safeParse(
      makeSpell({
        heightening: {
          kind: 'interval',
          interval: 1,
          description: 'The damage increases by 1d4.',
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts fixed-rank heightening', () => {
    const result = spellEntrySchema.safeParse(
      makeSpell({
        heightening: {
          kind: 'fixedRanks',
          entries: [
            { rank: 4, description: 'You can target one additional creature.' },
            { rank: 7, description: 'You can target two additional creatures.' },
          ],
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an empty fixedRanks entries array', () => {
    const result = spellEntrySchema.safeParse(
      makeSpell({ heightening: { kind: 'fixedRanks', entries: [] } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a rank outside 1-10', () => {
    expect(spellEntrySchema.safeParse(makeSpell({ rank: 0 })).success).toBe(false);
    expect(spellEntrySchema.safeParse(makeSpell({ rank: 11 })).success).toBe(false);
  });

  it('accepts a sustained spell', () => {
    expect(spellEntrySchema.safeParse(makeSpell({ sustained: true })).success).toBe(true);
  });
});
