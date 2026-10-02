import { describe, expect, it } from 'vitest';

import { characterDataSchema, newCharacterData } from './character.js';
import { npcDataSchema } from './npc.js';
import { averageDamage, persistentDamageSchema } from './persistentDamage.js';

const ID = '4b1e7c20-9d3a-4f6e-8c11-2a5d7e9f0b34';

describe('averageDamage', () => {
  it('averages a plain dice formula', () => {
    expect(averageDamage('1d6')).toBe(3.5);
    expect(averageDamage('2d6+3')).toBe(10);
    expect(averageDamage('1d8-1')).toBe(3.5);
    expect(averageDamage('5')).toBe(5);
    expect(averageDamage('3d4')).toBe(7.5);
  });

  it('refuses anything that is not a plain formula', () => {
    for (const formula of ['', 'fire', '1d', '@level', '2d6kh1', '1d6!', '1d6r1', '2d']) {
      expect(averageDamage(formula)).toBeUndefined();
    }
  });
});

describe('persistentDamageSchema', () => {
  it('parses an entry, with or without a source', () => {
    const entry = { id: ID, formula: '1d6', damageType: 'fire' };
    expect(persistentDamageSchema.parse(entry)).toEqual(entry);
    expect(persistentDamageSchema.parse({ ...entry, source: 'Torch' }).source).toBe(
      'Torch',
    );
  });

  it('rejects a bad formula, an empty type, an empty source, and a bad id', () => {
    const entry = { id: ID, formula: '1d6', damageType: 'fire' };
    for (const bad of [
      { ...entry, formula: 'lots' },
      { ...entry, formula: '2d6kh1' },
      { ...entry, damageType: '' },
      { ...entry, source: '' },
      { ...entry, id: 'nope' },
    ]) {
      expect(persistentDamageSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('an actor stored before persistent damage existed', () => {
  it('parses a character with an empty list', () => {
    const { persistentDamage: _omit, ...stored } = newCharacterData();
    const parsed = characterDataSchema.parse(stored);
    expect(parsed.persistentDamage).toEqual([]);
  });

  it('parses a monster with an empty list', () => {
    const creature = {
      id: ID,
      schemaVersion: 1,
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      packId: 'bestiary',
      slug: 'invented-bog-strangler',
      name: 'Invented Bog Strangler',
      kind: 'creature',
      provenance: {
        publication: 'Pathfinder Monster Core',
        license: 'ORC',
        remaster: true,
      },
      level: 3,
      size: 'large',
      perception: 8,
      ac: 19,
      savingThrows: { fortitude: 10, reflex: 6, will: 7 },
      hp: 45,
      speeds: { land: 25 },
      attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
    };
    const parsed = npcDataSchema.parse({ creature, hp: { current: 45 }, conditions: [] });
    expect(parsed.persistentDamage).toEqual([]);
  });

  it('keeps persistent damage that is there, on both', () => {
    const entry = { id: ID, formula: '1d6', damageType: 'fire' };
    expect(
      characterDataSchema.parse({ ...newCharacterData(), persistentDamage: [entry] })
        .persistentDamage,
    ).toEqual([entry]);
  });
});
