import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import { characterDataSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import { adjustActorCoins } from './coins.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-coins-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-05T00:00:00.000Z';

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  return {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const gm = () => makeSeat({ name: 'GM', isGM: true });

const coinsOf = (actorId: string) =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system).coins;

describe('adjustActorCoins', () => {
  it('gives the owner coins, starting from an empty purse', () => {
    const owner = makeSeat();
    const actorId = createActor(store, owner, { kind: 'character', name: 'Valeria' }).id;

    const { documents } = adjustActorCoins(store, owner, {
      actorId,
      delta: { gp: 15 },
    });

    expect(documents[0]?.id).toBe(actorId);
    // Reassembled to the fewest coins (adjustCoins, "makes change" even on a
    // gain, not only a spend): 15 gp is 1500 cp, which is 1 pp + 5 gp.
    expect(coinsOf(actorId)).toEqual({ pp: 1, gp: 5, sp: 0, cp: 0 });
  });

  it('lets the GM adjust a purse the GM does not own', () => {
    const owner = makeSeat();
    const actorId = createActor(store, owner, { kind: 'character', name: 'Valeria' }).id;

    adjustActorCoins(store, gm(), { actorId, delta: { gp: 5 } });

    expect(coinsOf(actorId).gp).toBe(5);
  });

  it('spends, remaking change, when the purse can cover it', () => {
    const owner = makeSeat();
    const actorId = createActor(store, owner, { kind: 'character', name: 'Valeria' }).id;
    adjustActorCoins(store, owner, { actorId, delta: { gp: 1 } });

    adjustActorCoins(store, owner, { actorId, delta: { cp: -25 } });

    expect(coinsOf(actorId)).toEqual({ pp: 0, gp: 0, sp: 7, cp: 5 });
  });

  it('refuses a spend the purse cannot cover, leaving it unchanged', () => {
    const owner = makeSeat();
    const actorId = createActor(store, owner, { kind: 'character', name: 'Valeria' }).id;

    expect(() => adjustActorCoins(store, owner, { actorId, delta: { gp: -1 } })).toThrow(
      /enough coins/,
    );
    expect(coinsOf(actorId)).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 });
  });

  it('refuses a non-owner, non-GM seat', () => {
    const owner = makeSeat();
    const actorId = createActor(store, owner, { kind: 'character', name: 'Valeria' }).id;

    expect(() =>
      adjustActorCoins(store, makeSeat(), { actorId, delta: { gp: 1 } }),
    ).toThrow(/permission/);
  });

  it('refuses an NPC -- only a character has a purse', () => {
    const owner = makeSeat();
    const actorId = createActor(store, owner, { kind: 'npc', name: 'Goblin' }).id;

    expect(() => adjustActorCoins(store, owner, { actorId, delta: { gp: 1 } })).toThrow(
      /character sheet/,
    );
  });
});
