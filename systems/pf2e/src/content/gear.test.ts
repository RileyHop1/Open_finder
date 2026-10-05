import { describe, expect, it } from 'vitest';

import { CONSUMABLE_CATEGORIES, gearEntrySchema } from './gear.js';

function makeGear(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'equipment',
    slug: 'grappling-hook',
    name: 'Grappling Hook',
    kind: 'gear',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    ...overrides,
  };
}

describe('gearEntrySchema', () => {
  it('accepts a minimal well-formed gear entry', () => {
    expect(gearEntrySchema.safeParse(makeGear()).success).toBe(true);
  });

  it('accepts gear carrying rule elements (e.g. a wand granting a spell)', () => {
    const result = gearEntrySchema.safeParse(
      makeGear({
        slug: 'wand-of-magic-missile',
        name: 'Wand of Magic Missile',
        ruleElements: [{ kind: 'grantItem', packId: 'spells', slug: 'magic-missile' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a trait that is not a valid slug', () => {
    expect(gearEntrySchema.safeParse(makeGear({ traits: ['Not A Slug'] })).success).toBe(
      false,
    );
  });

  it('rejects a mismatched kind', () => {
    expect(gearEntrySchema.safeParse(makeGear({ kind: 'weapon' })).success).toBe(false);
  });

  it('leaves price, bulk, and level undefined when absent', () => {
    const result = gearEntrySchema.safeParse(makeGear());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceInCopper).toBeUndefined();
      expect(result.data.bulk).toBeUndefined();
      expect(result.data.level).toBeUndefined();
    }
  });

  it('accepts price, bulk, and level when present', () => {
    const result = gearEntrySchema.safeParse(
      makeGear({ priceInCopper: 50, bulk: 0.1, level: 1 }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceInCopper).toBe(50);
      expect(result.data.bulk).toBe(0.1);
      expect(result.data.level).toBe(1);
    }
  });

  it('rejects a negative price or bulk', () => {
    expect(gearEntrySchema.safeParse(makeGear({ priceInCopper: -1 })).success).toBe(
      false,
    );
    expect(gearEntrySchema.safeParse(makeGear({ bulk: -1 })).success).toBe(false);
  });

  it('leaves consumable undefined on ordinary gear', () => {
    const result = gearEntrySchema.safeParse(makeGear());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.consumable).toBeUndefined();
    }
  });

  it.each(CONSUMABLE_CATEGORIES)(
    'accepts a single-use %s with no uses field',
    (category) => {
      const result = gearEntrySchema.safeParse(
        makeGear({
          slug: 'minor-elixir-of-life',
          name: 'Minor Elixir of Life',
          consumable: { category },
        }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.consumable?.uses).toBeUndefined();
      }
    },
  );

  it('accepts a multi-use consumable with current/max uses', () => {
    const result = gearEntrySchema.safeParse(
      makeGear({
        slug: 'wand-of-magic-missile',
        name: 'Wand of Magic Missile',
        consumable: { category: 'wand', uses: { current: 1, max: 1 } },
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.consumable?.uses).toEqual({ current: 1, max: 1 });
    }
  });

  it('accepts a scroll with a spell reference, and leaves it absent when not given', () => {
    const scroll = gearEntrySchema.safeParse(
      makeGear({
        slug: 'scroll-of-fireball',
        name: 'Scroll of Fireball',
        consumable: {
          category: 'scroll',
          spell: { packId: 'spells', slug: 'fireball', rank: 3 },
        },
      }),
    );
    expect(scroll.success).toBe(true);
    if (scroll.success) {
      expect(scroll.data.consumable?.spell).toEqual({
        packId: 'spells',
        slug: 'fireball',
        rank: 3,
      });
    }

    const unknownScroll = gearEntrySchema.safeParse(
      makeGear({
        slug: 'scroll-of-unknown-spell',
        name: 'Scroll of Unknown Spell',
        consumable: { category: 'scroll' },
      }),
    );
    expect(unknownScroll.success).toBe(true);
    if (unknownScroll.success) {
      expect(unknownScroll.data.consumable?.spell).toBeUndefined();
    }
  });

  it('rejects a consumable category outside the closed vocabulary', () => {
    expect(
      gearEntrySchema.safeParse(makeGear({ consumable: { category: 'bomb' } })).success,
    ).toBe(false);
  });

  it("rejects a spell rank outside 1-10, matching spell.ts's own rank range", () => {
    expect(
      gearEntrySchema.safeParse(
        makeGear({
          consumable: {
            category: 'scroll',
            spell: { packId: 'spells', slug: 'fireball', rank: 11 },
          },
        }),
      ).success,
    ).toBe(false);
  });
});
