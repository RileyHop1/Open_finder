import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, Seat } from '@hearthtable/core';
import {
  actorSchema,
  chatCheckMessageSchema,
  chatStrikeAttackMessageSchema,
  chatStrikeDamageMessageSchema,
} from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import type { CreatureEntry, Pf2eEntry } from '@hearthtable/pf2e';
import { creatureEntrySchema, npcDataSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActorFromCreature } from './actors.js';
import { rollActorCheck } from './checks.js';
import type { CompendiumIndex } from './compendium.js';
import { OperationRejected } from './rejection.js';
import { rollActorDamage, rollActorStrike } from './strikeRolls.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-npc-rolls-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
  gm = seatOf(true);
  player = seatOf(false);
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-01T00:00:00.000Z';

const seatOf = (isGM: boolean): Seat => ({
  id: crypto.randomUUID(),
  worldId: store.world.id,
  schemaVersion: 1,
  name: isGM ? 'GM' : 'Valeros',
  isGM,
  createdAt: NOW,
  updatedAt: NOW,
});

const fixed =
  (face: number): RandomSource =>
  () =>
    face;

/** An invented monster with hand-computed numbers: Athletics +11, Vine +11 for 1d8+4, Slam +9 for 2d6 with deadly and fatal. */
const MONSTER: CreatureEntry = creatureEntrySchema.parse({
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'bestiary',
  slug: 'invented-bog-strangler',
  name: 'Invented Bog Strangler',
  kind: 'creature',
  provenance: { publication: 'Pathfinder Monster Core', license: 'ORC', remaster: true },
  traits: [],
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
  speeds: { land: 25 },
  attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
  skills: { athletics: 11 },
  strikes: [
    {
      name: 'Vine',
      attackBonus: 11,
      traits: [],
      damage: [{ diceNumber: 1, dieFaces: 8, bonus: 4, damageType: 'bludgeoning' }],
    },
    {
      name: 'Slam',
      attackBonus: 9,
      traits: ['fatal-d10'],
      damage: [{ diceNumber: 2, dieFaces: 6, bonus: 0, damageType: 'bludgeoning' }],
    },
  ],
  languages: [],
});

const compendium: CompendiumIndex = {
  status: () => ({ available: true, packs: [], entryCount: 1, skipped: 0 }),
  search: () => [],
  get: (packId, slug): Pf2eEntry | undefined =>
    packId === MONSTER.packId && slug === MONSTER.slug ? MONSTER : undefined,
  conditions: () => new Map(),
};

let gm: Seat;
let player: Seat;

function monster(): Actor {
  return createActorFromCreature(store, gm, compendium, {
    packId: MONSTER.packId,
    slug: MONSTER.slug,
  });
}

/** Stores the monster with frightened 2. */
function frighten(actor: Actor): void {
  const data = npcDataSchema.parse(actor.system);
  store.putDocument(
    actorSchema.parse({
      ...actor,
      system: { ...data, conditions: [{ slug: 'frightened', value: 2 }] },
    }),
  );
}

describe('rolling a check for a monster', () => {
  it('rolls a skill from the creature’s own number and records the actor', () => {
    const actor = monster();
    const message = rollActorCheck(store, gm, fixed(10), {
      actorId: actor.id,
      statistic: 'skill:athletics',
    });
    expect(chatCheckMessageSchema.parse(message)).toMatchObject({
      actorId: actor.id,
      actorName: 'Invented Bog Strangler',
      label: 'Athletics',
      breakdown: { total: 11 },
      roll: { total: 21, natural: 10 },
    });
    expect(store.getDocument(message.id)).toMatchObject({ kind: 'check' });
  });

  it('rolls perception and a save, against a DC', () => {
    const actor = monster();
    const perception = rollActorCheck(store, gm, fixed(10), {
      actorId: actor.id,
      statistic: 'perception',
      dc: 18,
    });
    expect(perception.breakdown.total).toBe(8);
    expect(perception.roll.degree).toBe('success');
    const fort = rollActorCheck(store, gm, fixed(10), {
      actorId: actor.id,
      statistic: 'fortitude',
    });
    expect(fort.breakdown.total).toBe(10);
  });

  it('applies the monster’s conditions, with the line shown', () => {
    const actor = monster();
    frighten(actor);
    const message = rollActorCheck(store, gm, fixed(10), {
      actorId: actor.id,
      statistic: 'skill:athletics',
    });
    expect(message.breakdown.total).toBe(9);
    expect(message.roll.total).toBe(19);
    expect(message.breakdown.modifiers.some((m) => m.slug === 'frightened')).toBe(true);
  });

  it('refuses AC, an unknown skill, and a player, rolling nothing', () => {
    const actor = monster();
    const roll =
      (statistic: string, seat = gm) =>
      () =>
        rollActorCheck(store, seat, fixed(10), { actorId: actor.id, statistic });
    expect(roll('ac')).toThrow('cannot be rolled as a check');
    expect(roll('skill:stealth')).toThrow('cannot be rolled as a check');
    expect(roll('perception', player)).toThrow(OperationRejected);
    expect(store.listDocuments('chatMessage')).toEqual([]);
  });

  it('refuses a hand-made NPC that has no creature to roll', () => {
    const handMade = actorSchema.parse({
      ...monster(),
      id: crypto.randomUUID(),
      system: {},
    });
    store.putDocument(handMade);
    expect(() =>
      rollActorCheck(store, gm, fixed(10), {
        actorId: handMade.id,
        statistic: 'perception',
      }),
    ).toThrow('has no creature stats to roll');
  });
});

describe('rolling a monster’s strike', () => {
  const attack = (
    actor: Actor,
    attackNumber: 1 | 2 | 3,
    extra: { dc?: number; strikeKey?: string } = {},
    seat = gm,
  ) =>
    rollActorStrike(store, seat, fixed(10), {
      actorId: actor.id,
      strikeKey: 'strike:vine',
      attackNumber,
      ...extra,
    });

  it('attacks with the printed bonus and names the strike by key', () => {
    const actor = monster();
    const message = attack(actor, 1);
    expect(chatStrikeAttackMessageSchema.parse(message)).toMatchObject({
      actorId: actor.id,
      strikeKey: 'strike:vine',
      weaponName: 'Vine',
      attackNumber: 1,
      breakdown: { total: 11 },
      roll: { total: 21 },
    });
    expect(message.itemId).toBeUndefined();
  });

  it('steps the Multiple Attack Penalty', () => {
    const actor = monster();
    expect(attack(actor, 2).breakdown.total).toBe(6);
    expect(attack(actor, 3).breakdown.total).toBe(1);
  });

  it('adds a degree of success against a DC', () => {
    expect(attack(monster(), 1, { dc: 19 }).roll.degree).toBe('success');
  });

  it('is lowered by frightened', () => {
    const actor = monster();
    frighten(actor);
    expect(attack(actor, 1).breakdown.total).toBe(9);
  });

  it('refuses an unknown strike, a player, and an itemId', () => {
    const actor = monster();
    expect(() => attack(actor, 1, { strikeKey: 'strike:bite' })).toThrow(
      'has no strike strike:bite',
    );
    expect(() => attack(actor, 1, {}, player)).toThrow(OperationRejected);
    expect(() =>
      rollActorStrike(store, gm, fixed(10), {
        actorId: actor.id,
        itemId: crypto.randomUUID(),
        attackNumber: 1,
      }),
    ).toThrow('give strikeKey');
    expect(store.listDocuments('chatMessage')).toEqual([]);
  });
});

describe('rolling a monster’s damage', () => {
  const damage = (
    actor: Actor,
    critical: boolean,
    strikeKey = 'strike:vine',
    seat = gm,
  ) => rollActorDamage(store, seat, fixed(5), { actorId: actor.id, strikeKey, critical });

  it('rolls the printed dice and bonus', () => {
    const actor = monster();
    const message = damage(actor, false);
    expect(chatStrikeDamageMessageSchema.parse(message)).toMatchObject({
      strikeKey: 'strike:vine',
      weaponName: 'Vine',
      critical: false,
      roll: { total: 9, damage: { bludgeoning: 9 } },
    });
  });

  it('doubles on a critical hit', () => {
    expect(damage(monster(), true).roll.total).toBe(18);
  });

  it('swaps in the fatal die on a critical hit', () => {
    const actor = monster();
    // 2d6 with fatal d10 becomes 3d10 on a critical, then doubles: (3 x 5) x 2.
    expect(damage(actor, false, 'strike:slam').roll.total).toBe(10);
    expect(damage(actor, true, 'strike:slam').roll.total).toBe(30);
  });

  it('takes enfeebled’s penalty off a melee strike', () => {
    const actor = monster();
    const data = npcDataSchema.parse(actor.system);
    store.putDocument(
      actorSchema.parse({
        ...actor,
        system: { ...data, conditions: [{ slug: 'enfeebled', value: 2 }] },
      }),
    );
    const message = damage(actor, false);
    expect(message.roll.total).toBe(7);
    expect(message.breakdown.total).toBe(-2);
  });

  it('refuses a player and an unknown strike', () => {
    const actor = monster();
    expect(() => damage(actor, false, 'strike:vine', player)).toThrow(OperationRejected);
    expect(() => damage(actor, false, 'strike:bite')).toThrow('has no strike');
  });
});
