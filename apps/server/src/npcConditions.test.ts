import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type { ConditionEntry, Pf2eEntry } from '@hearthtable/pf2e';
import { creatureEntrySchema, npcDataSchema, prepareNpc } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActorFromCreature } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import {
  addConditionToActor,
  removeConditionFromActor,
  setConditionOnActor,
} from './conditions.js';
import { OperationRejected } from './rejection.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;
let gm: Seat;
let player: Seat;

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

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-npc-conditions-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
  gm = seatOf(true);
  player = seatOf(false);
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const MONSTER = creatureEntrySchema.parse({
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'bestiary',
  slug: 'invented-bog-strangler',
  name: 'Invented Bog Strangler',
  kind: 'creature',
  provenance: { publication: 'Pathfinder Monster Core', license: 'ORC', remaster: true },
  level: 3,
  size: 'large',
  perception: 8,
  ac: 19,
  savingThrows: { fortitude: 10, reflex: 6, will: 7 },
  hp: 45,
  speeds: { land: 25 },
  attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
});

function definition(
  slug: string,
  fields: Partial<Pick<ConditionEntry, 'valued' | 'maxValue'>> = {},
): ConditionEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'conditions',
    slug,
    name: slug,
    kind: 'condition',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
    valued: false,
    overrides: [],
    ...fields,
  };
}

const conditions = new Map([
  ['frightened', definition('frightened', { valued: true, maxValue: 4 })],
  ['prone', definition('prone')],
]);

const compendium: CompendiumIndex = {
  status: () => ({ available: true, packs: [], entryCount: 3, skipped: 0 }),
  search: () => [],
  get: (packId, slug): Pf2eEntry | undefined =>
    packId === MONSTER.packId && slug === MONSTER.slug ? MONSTER : undefined,
  conditions: () => conditions,
  traits: () => [],
};

const monster = (): Actor =>
  createActorFromCreature(store, gm, compendium, {
    packId: MONSTER.packId,
    slug: MONSTER.slug,
  });

const stored = (actor: Actor) =>
  npcDataSchema.parse(actorSchema.parse(store.getDocument(actor.id)).system);

describe('conditions on a monster', () => {
  it('adds a valued condition, which lowers the monster’s prepared AC', () => {
    const actor = monster();
    const updated = addConditionToActor(store, gm, compendium, {
      actorId: actor.id,
      slug: 'frightened',
      value: 2,
    });
    expect(npcDataSchema.parse(updated.system).conditions).toEqual([
      { slug: 'frightened', value: 2 },
    ]);
    expect(stored(actor).conditions).toEqual([{ slug: 'frightened', value: 2 }]);
    expect(prepareNpc(stored(actor)).statistics['ac']?.total).toBe(17);
    expect(updated.updatedAt >= actor.updatedAt).toBe(true);
  });

  it('keeps the higher value on a second add, as for a character', () => {
    const actor = monster();
    const add = (value: number) =>
      addConditionToActor(store, gm, compendium, {
        actorId: actor.id,
        slug: 'frightened',
        value,
      });
    add(3);
    add(1);
    expect(stored(actor).conditions).toEqual([{ slug: 'frightened', value: 3 }]);
  });

  it('sets a value exactly, and 0 clears it: the GM override', () => {
    const actor = monster();
    const set = (value: number) =>
      setConditionOnActor(store, gm, compendium, {
        actorId: actor.id,
        slug: 'frightened',
        value,
      });
    set(3);
    set(1);
    expect(stored(actor).conditions).toEqual([{ slug: 'frightened', value: 1 }]);
    set(0);
    expect(stored(actor).conditions).toEqual([]);
  });

  it('removes a condition, and is not an error when it was not there', () => {
    const actor = monster();
    addConditionToActor(store, gm, compendium, { actorId: actor.id, slug: 'prone' });
    removeConditionFromActor(store, gm, { actorId: actor.id, slug: 'prone' });
    removeConditionFromActor(store, gm, { actorId: actor.id, slug: 'prone' });
    expect(stored(actor).conditions).toEqual([]);
  });

  it('leaves hit points and the creature alone', () => {
    const actor = monster();
    addConditionToActor(store, gm, compendium, { actorId: actor.id, slug: 'prone' });
    expect(stored(actor)).toMatchObject({
      hp: { current: 45, temp: 0 },
      creature: { ac: 19 },
      source: { slug: 'invented-bog-strangler' },
    });
  });

  it('refuses an unknown condition and a player, writing nothing', () => {
    const actor = monster();
    expect(() =>
      addConditionToActor(store, gm, compendium, { actorId: actor.id, slug: 'mystery' }),
    ).toThrow('unknown condition: mystery');
    expect(() =>
      addConditionToActor(store, player, compendium, {
        actorId: actor.id,
        slug: 'prone',
      }),
    ).toThrow(OperationRejected);
    expect(stored(actor).conditions).toEqual([]);
  });
});
