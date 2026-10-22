import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type { CharacterData, Pf2eEntry } from '@hearthtable/pf2e';
import { characterDataSchema, pf2eEntrySchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, updateActor } from './actors.js';
import { dailyPreparations, makeAlchemy } from './alchemy.js';
import type { CompendiumIndex } from './compendium.js';
import { addItem } from './items.js';
import { OperationRejected } from './rejection.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-alchemy-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-22T00:00:00.000Z';

// Invented items (ADR 0013).
const gear = (slug: string, traits: string[]) =>
  pf2eEntrySchema.parse({
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'equipment',
    slug,
    name: slug,
    kind: 'gear',
    provenance: {
      publication: 'Pathfinder Player Core 2',
      license: 'ORC',
      remaster: true,
    },
    traits,
    ruleElements: [],
    description: '',
    level: 1,
  });

const entries: Pf2eEntry[] = [
  gear('invented-tonic', ['alchemical', 'consumable']),
  gear('rope', []),
];

const compendium: CompendiumIndex = {
  status: () => ({ available: true, packs: [], entryCount: entries.length, skipped: 0 }),
  search: () => [],
  get: (packId, slug) => entries.find((e) => e.packId === packId && e.slug === slug),
  conditions: () => new Map(),
  traits: () => [],
};

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  return {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    schemaVersion: 1,
    name: 'Fizz',
    isGM: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const sheetOf = (actorId: string): CharacterData =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

function alchemist() {
  const owner = makeSeat();
  const actor = createActor(store, owner, { kind: 'character', name: 'Fizz' });
  return { owner, actorId: actor.id };
}

describe('makeAlchemy', () => {
  it('copies the item from the compendium as infused by Advanced Alchemy, spending no vial', () => {
    const { owner, actorId } = alchemist();
    makeAlchemy(store, owner, compendium, {
      actorId,
      packId: 'equipment',
      slug: 'invented-tonic',
      quantity: 2,
    });
    const [item] = sheetOf(actorId).items;
    expect(item).toMatchObject({
      source: { packId: 'equipment', slug: 'invented-tonic' },
      quantity: 2,
      infused: 'daily',
    });
    expect(item?.entry.name).toBe('invented-tonic');
    expect(sheetOf(actorId).resources).toEqual({});
  });

  it('spends a versatile vial for Quick Alchemy, past the last one too, keeping a hand-set maximum', () => {
    const { owner, actorId } = alchemist();
    updateActor(store, owner, {
      actorId,
      changes: { 'system.resources.versatile-vials': { used: 4, max: 4 } },
    });
    makeAlchemy(store, owner, compendium, {
      actorId,
      packId: 'equipment',
      slug: 'invented-tonic',
      quick: true,
    });
    const sheet = sheetOf(actorId);
    expect(sheet.items[0]?.infused).toBe('quick');
    expect(sheet.resources['versatile-vials']).toEqual({ used: 5, max: 4 });
  });

  it('refuses an entry the compendium does not have, and someone who does not own the character', () => {
    const { owner, actorId } = alchemist();
    expect(() =>
      makeAlchemy(store, owner, compendium, {
        actorId,
        packId: 'equipment',
        slug: 'gone',
      }),
    ).toThrow(OperationRejected);
    expect(() =>
      makeAlchemy(store, makeSeat(), compendium, {
        actorId,
        packId: 'equipment',
        slug: 'invented-tonic',
      }),
    ).toThrow(OperationRejected);
  });
});

describe('dailyPreparations', () => {
  it('refills the pools and the focus pool, rests the slots, and clears infused items only', () => {
    const { owner, actorId } = alchemist();
    addItem(store, owner, compendium, { actorId, packId: 'equipment', slug: 'rope' });
    makeAlchemy(store, owner, compendium, {
      actorId,
      packId: 'equipment',
      slug: 'invented-tonic',
    });
    makeAlchemy(store, owner, compendium, {
      actorId,
      packId: 'equipment',
      slug: 'invented-tonic',
      quick: true,
    });
    updateActor(store, owner, {
      actorId,
      changes: {
        'system.focusPoints': { max: 2, current: 0 },
        'system.resources.versatile-vials.max': 6,
        'system.spellcasting': [
          {
            id: '00000000-0000-4000-8000-000000000001',
            kind: 'spontaneous',
            name: 'Invented casting',
            tradition: 'arcane',
            attribute: 'int',
            rank: 'trained',
            slots: { '1': { max: 2, used: 2 } },
          },
        ],
      },
    });

    dailyPreparations(store, owner, { actorId });
    const sheet = sheetOf(actorId);
    expect(sheet.items.map((i) => i.entry.slug)).toEqual(['rope']);
    expect(sheet.resources['versatile-vials']).toEqual({ used: 0, max: 6 });
    expect(sheet.focusPoints).toEqual({ max: 2, current: 2 });
    const entry = sheet.spellcasting[0];
    expect(entry?.kind === 'spontaneous' ? entry.slots['1'] : undefined).toEqual({
      max: 2,
      used: 0,
    });
  });
});
