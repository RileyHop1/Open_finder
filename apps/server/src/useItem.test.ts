import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema, chatItemUseMessageSchema } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import type { CharacterData, GearEntry, Pf2eEntry } from '@hearthtable/pf2e';
import { characterDataSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { addItem } from './items.js';
import { useItem } from './useItem.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-useitem-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-06T00:00:00.000Z';

const base = (slug: string, name: string) => ({
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'equipment',
  slug,
  name,
  provenance: {
    publication: 'Pathfinder Player Core',
    license: 'ORC' as const,
    remaster: true as const,
  },
  traits: [],
  ruleElements: [],
  description: '',
});

const POTION: GearEntry = {
  ...base('minor-healing-potion', 'Minor Healing Potion'),
  kind: 'gear',
  description: 'Drink this potion to regain 1d8+5 Hit Points.',
  consumable: { category: 'potion' },
};

const WAND: GearEntry = {
  ...base('wand-of-magic-missile', 'Wand of Magic Missile'),
  kind: 'gear',
  description: 'Cast magic missile.',
  consumable: { category: 'wand', uses: { current: 2, max: 2 } },
};

const ROPE: GearEntry = { ...base('rope', 'Rope'), kind: 'gear' };

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

const compendium = compendiumOf([POTION, WAND, ROPE]);

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

function ownedCharacter(seat: Seat) {
  return createActor(store, seat, { kind: 'character', name: 'Hero' }).id;
}

const sheetOf = (actorId: string): CharacterData =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

const add = (seat: Seat, actorId: string, slug: string) =>
  addItem(store, seat, compendium, { actorId, packId: 'equipment', slug });

/** A fixed roll of its maximum, so `1d8+5` always evaluates to 13. */
const maxRoll: RandomSource = (faces) => faces;

describe('useItem', () => {
  it('spends a single-use consumable, removing it, and posts the card with a rolled formula', () => {
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);
    add(owner, actorId, 'minor-healing-potion');
    const itemId = sheetOf(actorId).items[0]?.id;
    if (itemId === undefined) throw new Error('setup failed');

    const { documents } = useItem(store, owner, maxRoll, { actorId, itemId });

    expect(sheetOf(actorId).items).toHaveLength(0);
    const message = chatItemUseMessageSchema.parse(
      documents.find((d) => d.type === 'chatMessage'),
    );
    expect(message.itemName).toBe('Minor Healing Potion');
    expect(message.roll?.total).toBe(13);
  });

  it('decrements a multi-use consumable without removing it', () => {
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);
    add(owner, actorId, 'wand-of-magic-missile');
    const itemId = sheetOf(actorId).items[0]?.id;
    if (itemId === undefined) throw new Error('setup failed');

    useItem(store, owner, maxRoll, { actorId, itemId });

    const items = sheetOf(actorId).items;
    expect(items).toHaveLength(1);
    expect(
      items[0]?.entry.kind === 'gear' ? items[0].entry.consumable?.uses : undefined,
    ).toEqual({ current: 1, max: 2 });
  });

  it('refuses using up the last charge of an empty wand', () => {
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);
    add(owner, actorId, 'wand-of-magic-missile');
    const itemId = sheetOf(actorId).items[0]?.id;
    if (itemId === undefined) throw new Error('setup failed');

    useItem(store, owner, maxRoll, { actorId, itemId });
    useItem(store, owner, maxRoll, { actorId, itemId });

    expect(() => useItem(store, owner, maxRoll, { actorId, itemId })).toThrow(
      /no uses left/,
    );
  });

  it('lets the GM use an item on a character the GM does not own', () => {
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);
    add(owner, actorId, 'minor-healing-potion');
    const itemId = sheetOf(actorId).items[0]?.id;
    if (itemId === undefined) throw new Error('setup failed');

    expect(() => useItem(store, gm(), maxRoll, { actorId, itemId })).not.toThrow();
  });

  it('refuses a non-owner, non-GM seat', () => {
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);
    add(owner, actorId, 'minor-healing-potion');
    const itemId = sheetOf(actorId).items[0]?.id;
    if (itemId === undefined) throw new Error('setup failed');

    expect(() => useItem(store, makeSeat(), maxRoll, { actorId, itemId })).toThrow(
      /permission/,
    );
  });

  it('refuses an item that is not a consumable', () => {
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);
    add(owner, actorId, 'rope');
    const itemId = sheetOf(actorId).items[0]?.id;
    if (itemId === undefined) throw new Error('setup failed');

    expect(() => useItem(store, owner, maxRoll, { actorId, itemId })).toThrow(
      /not a consumable/,
    );
  });

  it('refuses an item that is not there', () => {
    const owner = makeSeat();
    const actorId = ownedCharacter(owner);

    expect(() =>
      useItem(store, owner, maxRoll, { actorId, itemId: crypto.randomUUID() }),
    ).toThrow(/no item found/);
  });
});
