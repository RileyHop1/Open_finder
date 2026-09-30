import { describe, expect, it } from 'vitest';

import type { GearEntry, WeaponEntry } from '../index.js';
import { characterDataSchema } from './character.js';

const IMPORTED_AT = '2026-09-30T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

const WEAPON: WeaponEntry = {
  id: '55555555-5555-5555-8555-555555555555',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-sword',
  name: 'Invented Sword',
  kind: 'weapon',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
  category: 'martial',
  group: 'sword',
  damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
  hands: 1,
};

const CONDITION_LIKE_GEAR: GearEntry = {
  id: '66666666-6666-5666-8666-666666666666',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'equipment',
  slug: 'invented-rope',
  name: 'Invented Rope',
  kind: 'gear',
  provenance: PROVENANCE,
  traits: [],
  ruleElements: [],
  description: '',
};

function minimal() {
  return {
    level: 1,
    attributes: { str: 4, dex: 2, con: 2, int: 0, wis: 1, cha: 0 },
    keyAttribute: 'str' as const,
    ranks: {},
    hp: { current: 20 },
  };
}

describe('characterDataSchema', () => {
  it('fills every default for a minimal hand-built character', () => {
    const parsed = characterDataSchema.parse(minimal());
    expect(parsed.ranks.perception).toBe('untrained');
    expect(parsed.ranks.weapons).toEqual({
      unarmed: 'untrained',
      simple: 'untrained',
      martial: 'untrained',
      advanced: 'untrained',
    });
    expect(parsed.ranks.armor.heavy).toBe('untrained');
    expect(parsed.ranks.skills).toEqual({});
    expect(parsed.hp).toEqual({ current: 20, temp: 0 });
    expect(parsed.items).toEqual([]);
    expect(parsed.conditions).toEqual([]);
    expect(parsed.choices).toEqual({});
    expect(parsed.ancestryHp).toBe(0);
  });

  it('keeps explicit ranks, including a Lore skill', () => {
    const parsed = characterDataSchema.parse({
      ...minimal(),
      ranks: {
        perception: 'expert',
        weapons: { martial: 'expert' },
        skills: { athletics: 'trained', 'academia-lore': 'trained' },
      },
    });
    expect(parsed.ranks.perception).toBe('expert');
    expect(parsed.ranks.weapons.martial).toBe('expert');
    expect(parsed.ranks.weapons.simple).toBe('untrained');
    expect(parsed.ranks.skills['academia-lore']).toBe('trained');
  });

  it('embeds items with their own ids, defaulting to unequipped and quantity 1', () => {
    const parsed = characterDataSchema.parse({
      ...minimal(),
      items: [
        {
          id: crypto.randomUUID(),
          entry: WEAPON,
          source: { packId: 'equipment', slug: 'invented-sword' },
        },
        {
          id: crypto.randomUUID(),
          entry: CONDITION_LIKE_GEAR,
          equipped: true,
          quantity: 2,
        },
      ],
    });
    expect(parsed.items[0]).toMatchObject({ equipped: false, quantity: 1 });
    expect(parsed.items[1]).toMatchObject({ equipped: true, quantity: 2 });
  });

  it('rejects an item whose entry kind a character cannot carry', () => {
    const conditionEntry = { ...CONDITION_LIKE_GEAR, kind: 'condition', valued: false };
    const result = characterDataSchema.safeParse({
      ...minimal(),
      items: [{ id: crypto.randomUUID(), entry: conditionEntry }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects two items sharing an id', () => {
    const id = crypto.randomUUID();
    const result = characterDataSchema.safeParse({
      ...minimal(),
      items: [
        { id, entry: WEAPON },
        { id, entry: WEAPON },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts valued and binary conditions but rejects a repeated slug', () => {
    expect(
      characterDataSchema.safeParse({
        ...minimal(),
        conditions: [{ slug: 'frightened', value: 2 }, { slug: 'prone' }],
      }).success,
    ).toBe(true);
    expect(
      characterDataSchema.safeParse({
        ...minimal(),
        conditions: [
          { slug: 'frightened', value: 2 },
          { slug: 'frightened', value: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      characterDataSchema.safeParse({
        ...minimal(),
        conditions: [{ slug: 'frightened', value: 0 }],
      }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range level, negative HP, and an unknown key attribute or rank', () => {
    expect(characterDataSchema.safeParse({ ...minimal(), level: 0 }).success).toBe(false);
    expect(characterDataSchema.safeParse({ ...minimal(), level: 21 }).success).toBe(
      false,
    );
    expect(
      characterDataSchema.safeParse({ ...minimal(), hp: { current: -1 } }).success,
    ).toBe(false);
    expect(
      characterDataSchema.safeParse({ ...minimal(), keyAttribute: 'luck' }).success,
    ).toBe(false);
    expect(
      characterDataSchema.safeParse({ ...minimal(), ranks: { perception: 'supreme' } })
        .success,
    ).toBe(false);
  });
});
