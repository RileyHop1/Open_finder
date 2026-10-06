import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type { CharacterData, GearEntry, Pf2eEntry } from '@hearthtable/pf2e';
import { characterDataSchema, partyStashSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { addItem } from './items.js';
import { adjustPartyCoins, findParty } from './party.js';
import { transferInventory } from './transfer.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-transfer-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-06T00:00:00.000Z';

const ROPE: GearEntry = {
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'equipment',
  slug: 'rope',
  name: 'Rope',
  provenance: {
    publication: 'Pathfinder Player Core',
    license: 'ORC',
    remaster: true,
  },
  traits: [],
  ruleElements: [],
  description: '',
  kind: 'gear',
};

function compendiumOf(entries: readonly Pf2eEntry[]): CompendiumIndex {
  const byKey = new Map(entries.map((e) => [`${e.packId}/${e.slug}`, e]));
  return {
    status: () => ({
      available: entries.length > 0,
      packs: [],
      entryCount: entries.length,
      skipped: 0,
    }),
    search: () => [],
    get: (packId, slug) => byKey.get(`${packId}/${slug}`),
    conditions: () => new Map(),
    traits: () => [],
  };
}

const compendium = compendiumOf([ROPE]);

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

function ownedCharacter(seat: Seat = makeSeat()) {
  const actor = createActor(store, seat, { kind: 'character', name: 'Hero' });
  return actor.id;
}

const sheetOf = (actorId: string): CharacterData =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

const stashOf = () => partyStashSchema.parse(findParty(store)?.stash ?? {});

describe('transferInventory', () => {
  it('moves an item from a character to the party stash', () => {
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);
    addItem(store, owner, compendium, { actorId, packId: 'equipment', slug: 'rope' });
    const itemId = sheetOf(actorId).items[0]?.id;
    if (itemId === undefined) throw new Error('setup failed');

    transferInventory(store, owner, {
      from: { kind: 'actor', actorId },
      to: { kind: 'party' },
      item: { itemId },
    });

    expect(sheetOf(actorId).items).toHaveLength(0);
    expect(stashOf().items).toHaveLength(1);
    expect(stashOf().items[0]?.entry.slug).toBe('rope');
  });

  it('moves an item between two characters, splitting a stack by quantity', () => {
    const owner = makeSeat();
    const fromId = ownedCharacter(owner);
    const toId = ownedCharacter(owner);
    addItem(store, owner, compendium, {
      actorId: fromId,
      packId: 'equipment',
      slug: 'rope',
    });
    const itemId = sheetOf(fromId).items[0]?.id;
    if (itemId === undefined) throw new Error('setup failed');

    transferInventory(store, owner, {
      from: { kind: 'actor', actorId: fromId },
      to: { kind: 'actor', actorId: toId },
      item: { itemId, quantity: 1 },
    });

    expect(sheetOf(fromId).items).toHaveLength(0);
    expect(sheetOf(toId).items).toHaveLength(1);
  });

  it('moves coins from the party stash to a character, only the GM may', () => {
    adjustPartyCoins(store, gm(), { delta: { gp: 10 } });
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);

    transferInventory(store, gm(), {
      from: { kind: 'party' },
      to: { kind: 'actor', actorId },
      coins: { gp: 4 },
    });

    expect(stashOf().coins).toEqual({ pp: 0, gp: 6, sp: 0, cp: 0 });
    expect(sheetOf(actorId).coins).toEqual({ pp: 0, gp: 4, sp: 0, cp: 0 });
  });

  it('refuses a non-GM moving coins out of the party stash', () => {
    adjustPartyCoins(store, gm(), { delta: { gp: 10 } });
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);

    expect(() =>
      transferInventory(store, owner, {
        from: { kind: 'party' },
        to: { kind: 'actor', actorId },
        coins: { gp: 4 },
      }),
    ).toThrow(/GM/);
  });

  it('refuses a non-owner, non-GM seat moving an item out of a character', () => {
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);
    addItem(store, owner, compendium, { actorId, packId: 'equipment', slug: 'rope' });
    const itemId = sheetOf(actorId).items[0]?.id;
    if (itemId === undefined) throw new Error('setup failed');

    expect(() =>
      transferInventory(store, makeSeat(), {
        from: { kind: 'actor', actorId },
        to: { kind: 'party' },
        item: { itemId },
      }),
    ).toThrow(/permission/);
  });

  it('refuses moving coins the source does not have, leaving both sides unchanged', () => {
    const owner = makeSeat();
    const fromId = ownedCharacter(owner);
    const toId = ownedCharacter(owner);

    expect(() =>
      transferInventory(store, owner, {
        from: { kind: 'actor', actorId: fromId },
        to: { kind: 'actor', actorId: toId },
        coins: { gp: 1 },
      }),
    ).toThrow(/enough coins/);
    expect(sheetOf(fromId).coins).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 });
    expect(sheetOf(toId).coins).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 });
  });

  it('refuses moving an item that is not there', () => {
    const owner = makeSeat();
    const fromId = ownedCharacter(owner);
    const toId = ownedCharacter(owner);

    expect(() =>
      transferInventory(store, owner, {
        from: { kind: 'actor', actorId: fromId },
        to: { kind: 'actor', actorId: toId },
        item: { itemId: crypto.randomUUID() },
      }),
    ).toThrow(/no item found/);
  });
});
