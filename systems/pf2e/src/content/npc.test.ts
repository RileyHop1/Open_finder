import { describe, expect, it } from 'vitest';

import { newNpcFromCreature, npcDataSchema } from './npc.js';
import type { CreatureEntry } from './creature.js';

// An invented monster with hand-picked numbers, never a published stat block (ADR 0003, ADR 0013).
const IMPORTED_AT = '2026-10-01T00:00:00.000Z';

const BOG_STRANGLER: CreatureEntry = {
  id: '20000000-0001-5000-8000-000000000001',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'bestiary',
  slug: 'invented-bog-strangler',
  name: 'Invented Bog Strangler',
  kind: 'creature',
  provenance: {
    publication: 'Pathfinder Monster Core',
    license: 'ORC',
    remaster: true,
  },
  traits: ['aquatic'],
  ruleElements: [],
  description: '',
  level: 3,
  size: 'large',
  perception: 8,
  ac: 19,
  savingThrows: { fortitude: 10, reflex: 6, will: 7 },
  hp: 45,
  resistances: [],
  weaknesses: [],
  speeds: { land: 25, swim: 30 },
  attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
  skills: { athletics: 11 },
  strikes: [
    {
      name: 'Vine',
      attackBonus: 11,
      traits: [],
      damage: [{ diceNumber: 1, dieFaces: 8, bonus: 4, damageType: 'bludgeoning' }],
    },
  ],
  languages: [],
};

describe('newNpcFromCreature', () => {
  it('starts at full hit points with no temporary hit points and no conditions', () => {
    const npc = newNpcFromCreature(BOG_STRANGLER);
    expect(npc.hp).toEqual({ current: 45, temp: 0 });
    expect(npc.conditions).toEqual([]);
  });

  it('embeds the creature, so its stats are the entry as it was', () => {
    const npc = newNpcFromCreature(BOG_STRANGLER);
    expect(npc.creature).toMatchObject({
      name: 'Invented Bog Strangler',
      level: 3,
      size: 'large',
      ac: 19,
      hp: 45,
      savingThrows: { fortitude: 10, reflex: 6, will: 7 },
    });
    expect(npc.creature.strikes).toHaveLength(1);
  });

  it('copies rather than references: the actor keeps its own creature', () => {
    const npc = newNpcFromCreature(BOG_STRANGLER);
    expect(npc.creature).not.toBe(BOG_STRANGLER);
    expect(npc.creature.strikes).not.toBe(BOG_STRANGLER.strikes);
  });

  it('records where the copy came from, when told', () => {
    expect(
      newNpcFromCreature(BOG_STRANGLER, {
        packId: 'bestiary',
        slug: 'invented-bog-strangler',
      }).source,
    ).toEqual({ packId: 'bestiary', slug: 'invented-bog-strangler' });
    expect(newNpcFromCreature(BOG_STRANGLER).source).toBeUndefined();
  });
});

describe('npcDataSchema', () => {
  const valid = () => ({ creature: BOG_STRANGLER, hp: { current: 30 } });

  it('accepts an NPC and fills in temporary hit points and conditions', () => {
    const parsed = npcDataSchema.parse(valid());
    expect(parsed.hp).toEqual({ current: 30, temp: 0 });
    expect(parsed.conditions).toEqual([]);
  });

  it('accepts a creature below full hit points, and at 0', () => {
    expect(npcDataSchema.safeParse({ ...valid(), hp: { current: 0 } }).success).toBe(
      true,
    );
  });

  it('keeps conditions with and without values', () => {
    const parsed = npcDataSchema.parse({
      ...valid(),
      conditions: [{ slug: 'frightened', value: 2 }, { slug: 'prone' }],
    });
    expect(parsed.conditions).toEqual([
      { slug: 'frightened', value: 2 },
      { slug: 'prone' },
    ]);
  });

  it('rejects the same condition twice', () => {
    expect(
      npcDataSchema.safeParse({
        ...valid(),
        conditions: [
          { slug: 'frightened', value: 1 },
          { slug: 'frightened', value: 2 },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects negative or fractional hit points', () => {
    expect(npcDataSchema.safeParse({ ...valid(), hp: { current: -1 } }).success).toBe(
      false,
    );
    expect(npcDataSchema.safeParse({ ...valid(), hp: { current: 1.5 } }).success).toBe(
      false,
    );
    expect(
      npcDataSchema.safeParse({ ...valid(), hp: { current: 5, temp: -1 } }).success,
    ).toBe(false);
  });

  it('rejects a payload with no creature, or one that is not a creature entry', () => {
    expect(npcDataSchema.safeParse({ hp: { current: 5 } }).success).toBe(false);
    expect(
      npcDataSchema.safeParse({
        creature: { ...BOG_STRANGLER, kind: 'weapon' },
        hp: { current: 5 },
      }).success,
    ).toBe(false);
  });

  it('drops fields it does not know, so a client cannot smuggle one in', () => {
    const parsed = npcDataSchema.parse({ ...valid(), maxHp: 9999 });
    expect('maxHp' in parsed).toBe(false);
  });
});
