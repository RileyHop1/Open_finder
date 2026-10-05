import type { RuleElement } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import type {
  ArmorEntry,
  CharacterData,
  CharacterItem,
  FeatEntry,
  GearEntry,
} from '../index.js';
import { characterDataSchema } from '../index.js';
import { prepareCharacter } from './prepareCharacter.js';

const IMPORTED_AT = '2026-09-30T00:00:00.000Z';
const ENTRY_BASE = {
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'test',
  provenance: {
    publication: 'Pathfinder Player Core',
    license: 'ORC' as const,
    remaster: true as const,
  },
  traits: [],
  description: '',
};

function armor(overrides: Partial<ArmorEntry> = {}): ArmorEntry {
  return {
    ...ENTRY_BASE,
    id: '44444444-4444-5444-8444-444444444444',
    slug: 'invented-breastplate',
    name: 'Invented Breastplate',
    kind: 'armor',
    ruleElements: [],
    category: 'heavy',
    acBonus: 4,
    dexCap: 1,
    checkPenalty: -2,
    speedPenalty: 0,
    ...overrides,
  };
}

function feat(name: string, ruleElements: RuleElement[]): FeatEntry {
  return {
    ...ENTRY_BASE,
    id: crypto.randomUUID(),
    slug: name.toLowerCase().replace(/ /g, '-'),
    name,
    kind: 'feat',
    ruleElements,
    level: 1,
    category: 'general',
    prerequisites: [],
  };
}

function gear(name: string, ruleElements: RuleElement[]): GearEntry {
  return {
    ...ENTRY_BASE,
    id: crypto.randomUUID(),
    slug: name.toLowerCase().replace(/ /g, '-'),
    name,
    kind: 'gear',
    ruleElements,
  };
}

function item(entry: CharacterItem['entry'], equipped = false): CharacterItem {
  return { id: crypto.randomUUID(), entry, equipped, quantity: 1 };
}

const flat = (selector: string, value: number, type: 'item' | 'untyped' = 'untyped') =>
  ({ kind: 'flatModifier', selector, label: 'Invented Bonus', type, value }) as const;

function character(overrides: Partial<CharacterData> = {}): CharacterData {
  return characterDataSchema.parse({
    level: 1,
    attributes: { str: 4, dex: 2, con: 2, int: 0, wis: 1, cha: 0 },
    keyAttribute: 'str',
    ranks: {
      perception: 'expert',
      fortitude: 'expert',
      reflex: 'expert',
      will: 'trained',
      classDc: 'trained',
      armor: { heavy: 'trained', unarmored: 'trained' },
      skills: { athletics: 'trained', 'academia-lore': 'trained' },
    },
    ancestryHp: 8,
    classHp: 10,
    hp: { current: 20 },
    ...overrides,
  });
}

describe('prepareCharacter', () => {
  it('computes the same values the hand-built Fighter golden fixture pins', () => {
    const prepared = prepareCharacter(character({ items: [item(armor(), true)] }));
    const { statistics } = prepared;
    // 10 + 1 (dex, capped) + 3 (trained, level 1) + 4 (armor)
    expect(statistics['ac']?.total).toBe(18);
    expect(statistics['fortitude']?.total).toBe(7);
    expect(statistics['reflex']?.total).toBe(7);
    expect(statistics['will']?.total).toBe(4);
    expect(statistics['perception']?.total).toBe(6);
    expect(statistics['classDc']?.total).toBe(17);
    expect(statistics['skill:athletics']?.total).toBe(7);
    expect(statistics['skill:acrobatics']?.total).toBe(2);
    expect(prepared.hp.max.total).toBe(20);
  });

  it('uses the unarmored rank and no Dexterity cap when nothing is worn', () => {
    const { statistics } = prepareCharacter(character());
    // 10 + 2 (dex, uncapped) + 3 (trained unarmored) = 15
    expect(statistics['ac']?.total).toBe(15);
  });

  it('ignores armor in the pack, and reads the rank from the worn armor category', () => {
    const light = armor({ category: 'light', acBonus: 1, dexCap: undefined });
    const worn = prepareCharacter(character({ items: [item(light, true)] }));
    // light armor rank is untrained: 10 + 2 + 0 + 1
    expect(worn.statistics['ac']?.total).toBe(13);
    const packed = prepareCharacter(character({ items: [item(light, false)] }));
    expect(packed.statistics['ac']?.total).toBe(15);
  });

  it('includes a Lore skill and every named skill', () => {
    const { statistics } = prepareCharacter(character());
    expect(statistics['skill:academia-lore']?.total).toBe(3);
    expect(Object.keys(statistics).filter((k) => k.startsWith('skill:'))).toHaveLength(
      17,
    );
  });

  it('applies a feat’s rule elements always, but an unequipped item’s only when equipped', () => {
    const feats = item(feat('Invented Feat', [flat('ac', 1)]));
    const charm = item(gear('Invented Charm', [flat('ac', 1)]));
    // unarmored 15, plus the feat's +1
    expect(
      prepareCharacter(character({ items: [feats, charm] })).statistics['ac']?.total,
    ).toBe(16);
    // equipping the charm adds its own untyped +1, which stacks
    const equipped = { ...charm, equipped: true };
    expect(
      prepareCharacter(character({ items: [feats, equipped] })).statistics['ac']?.total,
    ).toBe(17);
  });

  it('routes selector aliases: a bare skill slug, saving-throw, skill-check, and all', () => {
    const { statistics } = prepareCharacter(
      character({
        items: [
          item(
            feat('Aliases', [
              flat('athletics', 1, 'item'),
              flat('saving-throw', 1, 'item'),
              flat('skill-check', 1, 'item'),
              flat('all', 1, 'item'),
            ]),
          ),
        ],
      }),
    );
    // item bonuses of the same type do not stack: only one +1 applies to each
    expect(statistics['skill:athletics']?.total).toBe(8);
    expect(statistics['fortitude']?.total).toBe(8);
    expect(statistics['perception']?.total).toBe(7);
  });

  it('adds condition modifiers and shows the suppressed line', () => {
    const prepared = prepareCharacter(
      character({
        conditions: [
          { slug: 'frightened', value: 2 },
          { slug: 'clumsy', value: 1 },
        ],
      }),
    );
    expect(prepared.statistics['reflex']?.total).toBe(5);
    expect(prepared.statistics['skill:athletics']?.total).toBe(5);
    const clumsy = prepared.statistics['reflex']?.modifiers.find(
      (m) => m.slug === 'clumsy',
    );
    expect(clumsy).toMatchObject({ applied: false, suppressedBy: 'frightened' });
  });

  it('lowers max HP for drained and adds hp-selector rule elements', () => {
    const prepared = prepareCharacter(
      character({
        level: 5,
        items: [item(feat('Invented Toughness', [flat('hp', 5)]))],
        conditions: [{ slug: 'drained', value: 1 }],
      }),
    );
    // 8 + (10 + 2) * 5 + 5 - (1 * 5)
    expect(prepared.hp.max.total).toBe(68);
  });

  it('flags items with inert automation and leaves their other lines alone', () => {
    const inert: RuleElement = {
      kind: 'inert',
      upstreamKind: 'ItemAlteration',
      reason: 'unmapped-element-kind',
    };
    const flagged = item(feat('Invented Complex Feat', [inert, inert, flat('ac', 1)]));
    const prepared = prepareCharacter(character({ items: [flagged] }));
    expect(prepared.inertItems).toEqual([
      { itemId: flagged.id, name: 'Invented Complex Feat', inertCount: 2 },
    ]);
    expect(prepared.statistics['ac']?.total).toBe(16);
  });

  it('carries stored HP through untouched', () => {
    const prepared = prepareCharacter(character({ hp: { current: 7, temp: 3 } }));
    expect(prepared.hp).toMatchObject({ current: 7, temp: 3 });
  });

  it('computes encumbrance from carried items, coins, and Strength -- the golden case for bulk.ts', () => {
    const rope = gear('Invented Rope', []);
    const prepared = prepareCharacter(
      character({
        // str: 4, so encumberedAt = 9, maxBulk = 14.
        items: [
          {
            id: crypto.randomUUID(),
            entry: { ...rope, bulk: 6 },
            equipped: false,
            quantity: 1,
          },
          {
            id: crypto.randomUUID(),
            entry: { ...rope, bulk: 1 },
            equipped: false,
            quantity: 2,
          },
        ],
        coins: { pp: 0, gp: 1000, sp: 0, cp: 0 },
      }),
    );
    // items: 6 + 1*2 = 8; coins: 1000/1000 = 1; total 9.
    expect(prepared.encumbrance.totalBulk).toBe(9);
    expect(prepared.encumbrance.encumberedAt).toBe(9);
    expect(prepared.encumbrance.maxBulk).toBe(14);
    expect(prepared.encumbrance.isEncumbered).toBe(false);
    expect(prepared.encumbrance.exceedsMax).toBe(false);
  });

  it('counts an unequipped item toward Bulk -- weight does not depend on being worn', () => {
    const rope = gear('Invented Rope', []);
    const prepared = prepareCharacter(
      character({ items: [item({ ...rope, bulk: 10 }, false)] }),
    );
    expect(prepared.encumbrance.totalBulk).toBe(10);
  });
});
