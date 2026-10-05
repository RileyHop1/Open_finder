import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type {
  ArmorEntry,
  CharacterData,
  ConditionEntry,
  GearEntry,
  Pf2eEntry,
  WeaponEntry,
} from '@hearthtable/pf2e';
import { characterDataSchema, prepareCharacter } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { emptyCompendium } from './compendium.js';
import { addItem, removeItem, updateItem } from './items.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-items-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-09-30T00:00:00.000Z';
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

const LONGSWORD: WeaponEntry = {
  ...base('longsword', 'Longsword'),
  kind: 'weapon',
  category: 'martial',
  group: 'sword',
  damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
  hands: 1,
};
const armorEntry = (slug: string, name: string, acBonus: number): ArmorEntry => ({
  ...base(slug, name),
  kind: 'armor',
  category: 'light',
  acBonus,
  checkPenalty: 0,
  speedPenalty: 0,
});
const LEATHER = armorEntry('leather', 'Leather Armor', 1);
const CHAIN = armorEntry('chain', 'Chain Shirt', 2);
const ROPE: GearEntry = { ...base('rope', 'Rope'), kind: 'gear' };
const PRONE: ConditionEntry = {
  ...base('prone', 'Prone'),
  packId: 'conditions',
  kind: 'condition',
  valued: false,
  overrides: [],
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

const compendium = compendiumOf([LONGSWORD, LEATHER, CHAIN, ROPE, PRONE]);

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

function ownedCharacter() {
  const owner = makeSeat();
  const actor = createActor(store, owner, { kind: 'character', name: 'Hero' });
  return { owner, actorId: actor.id };
}

const sheetOf = (actorId: string): CharacterData =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

const add = (seat: Seat, actorId: string, slug: string, packId = 'equipment') =>
  addItem(store, seat, compendium, { actorId, packId, slug });

describe('addItem', () => {
  it('copies the compendium entry onto the character, unequipped, quantity 1', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'longsword');

    const [item] = sheetOf(actorId).items;
    expect(item).toMatchObject({
      source: { packId: 'equipment', slug: 'longsword' },
      equipped: false,
      quantity: 1,
    });
    expect(item?.entry).toEqual(LONGSWORD);
  });

  it('keeps its copy when the compendium later changes (a re-import cannot rewrite a character)', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'longsword');
    const changed = compendiumOf([
      { ...LONGSWORD, damage: { diceNumber: 9, dieFaces: 12, damageType: 'slashing' } },
    ]);
    expect(changed.get('equipment', 'longsword')).toMatchObject({
      damage: { diceNumber: 9 },
    });
    expect(sheetOf(actorId).items[0]?.entry).toMatchObject({ damage: { diceNumber: 1 } });
  });

  it('adds a second copy as a separate item with its own id', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'rope');
    add(owner, actorId, 'rope');
    const { items } = sheetOf(actorId);
    expect(items).toHaveLength(2);
    expect(items[0]?.id).not.toBe(items[1]?.id);
  });

  it('rejects an unknown entry, saying when nothing has been imported at all', () => {
    const { owner, actorId } = ownedCharacter();
    expect(() => add(owner, actorId, 'nope')).toThrow(
      /no compendium entry equipment\/nope/,
    );
    expect(() =>
      addItem(store, owner, emptyCompendium(), {
        actorId,
        packId: 'equipment',
        slug: 'longsword',
      }),
    ).toThrow(/no content has been imported/);
  });

  it('rejects an entry a character cannot carry', () => {
    const { owner, actorId } = ownedCharacter();
    expect(() => add(owner, actorId, 'prone', 'conditions')).toThrow(/cannot be carried/);
    expect(sheetOf(actorId).items).toEqual([]);
  });

  it('rejects an actor with no character sheet', () => {
    const owner = makeSeat();
    const npc = createActor(store, owner, { kind: 'npc', name: 'Innkeeper' });
    expect(() => add(owner, npc.id, 'rope')).toThrow(/does not have a character sheet/);
  });

  it('lets the GM add to anyone, and refuses another player', () => {
    const { actorId } = ownedCharacter();
    add(makeSeat({ isGM: true }), actorId, 'rope');
    expect(sheetOf(actorId).items).toHaveLength(1);
    expect(() => add(makeSeat(), actorId, 'rope')).toThrow(/do not have permission/);
    expect(sheetOf(actorId).items).toHaveLength(1);
  });
});

describe('updateItem', () => {
  function withItems(...slugs: string[]) {
    const { owner, actorId } = ownedCharacter();
    for (const slug of slugs) {
      add(owner, actorId, slug);
    }
    return { owner, actorId, items: sheetOf(actorId).items };
  }

  it('equips and unequips an item', () => {
    const { owner, actorId, items } = withItems('longsword');
    const itemId = items[0]?.id ?? '';
    updateItem(store, owner, { actorId, itemId, equipped: true });
    expect(sheetOf(actorId).items[0]?.equipped).toBe(true);
    updateItem(store, owner, { actorId, itemId, equipped: false });
    expect(sheetOf(actorId).items[0]?.equipped).toBe(false);
  });

  it('sets a quantity without touching equipped, and both at once', () => {
    const { owner, actorId, items } = withItems('rope');
    const itemId = items[0]?.id ?? '';
    updateItem(store, owner, { actorId, itemId, quantity: 5 });
    expect(sheetOf(actorId).items[0]).toMatchObject({ quantity: 5, equipped: false });
    updateItem(store, owner, { actorId, itemId, equipped: true, quantity: 2 });
    expect(sheetOf(actorId).items[0]).toMatchObject({ quantity: 2, equipped: true });
  });

  it('takes off the other suit of armor when one is equipped', () => {
    const { owner, actorId, items } = withItems('leather', 'chain');
    const [leather, chain] = items;
    updateItem(store, owner, { actorId, itemId: leather?.id ?? '', equipped: true });
    updateItem(store, owner, { actorId, itemId: chain?.id ?? '', equipped: true });
    const after = sheetOf(actorId).items;
    expect(after.map((i) => i.equipped)).toEqual([false, true]);
  });

  it('does not take armor off when a weapon is equipped, or when armor is unequipped', () => {
    const { owner, actorId, items } = withItems('leather', 'longsword');
    const [leather, sword] = items;
    updateItem(store, owner, { actorId, itemId: leather?.id ?? '', equipped: true });
    updateItem(store, owner, { actorId, itemId: sword?.id ?? '', equipped: true });
    expect(sheetOf(actorId).items.map((i) => i.equipped)).toEqual([true, true]);
    updateItem(store, owner, { actorId, itemId: leather?.id ?? '', equipped: false });
    expect(sheetOf(actorId).items.map((i) => i.equipped)).toEqual([false, true]);
  });

  it('changes the derived AC once armor is equipped', () => {
    const { owner, actorId, items } = withItems('leather');
    const ac = () => prepareCharacter(sheetOf(actorId)).statistics['ac']?.total;
    expect(ac()).toBe(10);
    updateItem(store, owner, { actorId, itemId: items[0]?.id ?? '', equipped: true });
    expect(ac()).toBe(11);
  });

  it('rejects an unknown item and a non-owner', () => {
    const { owner, actorId, items } = withItems('rope');
    expect(() =>
      updateItem(store, owner, { actorId, itemId: crypto.randomUUID(), equipped: true }),
    ).toThrow(/no item found/);
    expect(() =>
      updateItem(store, makeSeat(), {
        actorId,
        itemId: items[0]?.id ?? '',
        equipped: true,
      }),
    ).toThrow(/do not have permission/);
  });

  it('never changes the item content', () => {
    const { owner, actorId, items } = withItems('longsword');
    updateItem(store, owner, { actorId, itemId: items[0]?.id ?? '', equipped: true });
    expect(sheetOf(actorId).items[0]?.entry).toEqual(LONGSWORD);
  });
});

describe('removeItem', () => {
  it('removes only the named item', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'rope');
    add(owner, actorId, 'longsword');
    const [rope, sword] = sheetOf(actorId).items;

    removeItem(store, owner, { actorId, itemId: rope?.id ?? '' });

    expect(sheetOf(actorId).items.map((i) => i.id)).toEqual([sword?.id]);
  });

  it('rejects an unknown item and a non-owner', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'rope');
    const itemId = sheetOf(actorId).items[0]?.id ?? '';
    expect(() =>
      removeItem(store, owner, { actorId, itemId: crypto.randomUUID() }),
    ).toThrow(/no item found/);
    expect(() => removeItem(store, makeSeat(), { actorId, itemId })).toThrow(
      /do not have permission/,
    );
    expect(sheetOf(actorId).items).toHaveLength(1);
  });
});
