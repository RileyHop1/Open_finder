import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema, canReadDocument, resolvePermission } from '@hearthtable/core';
import type { CreatureEntry, Pf2eEntry } from '@hearthtable/pf2e';
import { ancestryEntrySchema, npcDataSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActorFromCreature, updateActor } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { emptyCompendium } from './compendium.js';
import { OperationRejected } from './rejection.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-creature-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-01T00:00:00.000Z';

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
const player = () => makeSeat();

function creature(overrides: Partial<CreatureEntry> = {}): CreatureEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'bestiary',
    slug: 'invented-bog-strangler',
    name: 'Invented Bog Strangler',
    kind: 'creature',
    provenance: {
      publication: 'Pathfinder Monster Core',
      license: 'ORC',
      remaster: true,
    },
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
    ],
    languages: [],
    ...overrides,
  };
}

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
  };
}

const HUMAN = ancestryEntrySchema.parse({
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'ancestries',
  slug: 'invented-human',
  name: 'Invented Human',
  kind: 'ancestry',
  provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
  hp: 8,
  size: 'medium',
  speed: 25,
});

const compendium = compendiumOf([creature(), HUMAN]);
const make = (seat: Seat = gm(), index: CompendiumIndex = compendium) =>
  createActorFromCreature(store, seat, index, {
    packId: 'bestiary',
    slug: 'invented-bog-strangler',
  });

describe('createActorFromCreature', () => {
  it('makes an NPC named for the creature, at full hit points, with no conditions', () => {
    const actor = make();
    expect(actor).toMatchObject({
      type: 'actor',
      kind: 'npc',
      name: 'Invented Bog Strangler',
    });
    const system = npcDataSchema.parse(actor.system);
    expect(system.hp).toEqual({ current: 45, temp: 0 });
    expect(system.conditions).toEqual([]);
    expect(system.source).toEqual({ packId: 'bestiary', slug: 'invented-bog-strangler' });
    expect(system.creature).toMatchObject({ level: 3, size: 'large', ac: 19 });
    expect(actorSchema.parse(store.getDocument(actor.id))).toEqual(actor);
  });

  it('is hidden from players: they cannot read it, and the GM always owns it', () => {
    const actor = make();
    expect(actor.permissions).toEqual({ default: 'none', seats: {} });
    expect(canReadDocument(player(), actor)).toBe(false);
    expect(canReadDocument(undefined, actor)).toBe(false);
    expect(resolvePermission(gm(), actor)).toBe('owner');
  });

  it('copies the creature, so a later re-import cannot change this monster', () => {
    const actor = make();
    const changed = compendiumOf([creature({ hp: 999, ac: 40 })]);
    expect(make(gm(), changed).system).toMatchObject({ creature: { hp: 999 } });
    expect(npcDataSchema.parse(actor.system).creature).toMatchObject({ hp: 45, ac: 19 });
    expect(
      npcDataSchema.parse(actorSchema.parse(store.getDocument(actor.id)).system).creature
        .hp,
    ).toBe(45);
  });

  it('makes a separate actor each time, even for the same creature', () => {
    const first = make();
    const second = make();
    expect(first.id).not.toBe(second.id);
    expect(store.listDocuments('actor')).toHaveLength(2);
  });

  it('refuses a player, writing nothing', () => {
    expect(() => make(player())).toThrow('only the GM can add a monster');
    expect(store.listDocuments('actor')).toEqual([]);
  });

  it('refuses an entry that is not in the compendium, saying so when nothing has been imported', () => {
    expect(() =>
      createActorFromCreature(store, gm(), compendium, {
        packId: 'bestiary',
        slug: 'nope',
      }),
    ).toThrow('no compendium entry bestiary/nope');
    expect(() =>
      createActorFromCreature(store, gm(), emptyCompendium(), {
        packId: 'bestiary',
        slug: 'nope',
      }),
    ).toThrow('no content has been imported');
    expect(store.listDocuments('actor')).toEqual([]);
  });

  it('refuses an entry that is not a creature', () => {
    expect(() =>
      createActorFromCreature(store, gm(), compendium, {
        packId: 'ancestries',
        slug: 'invented-human',
      }),
    ).toThrow('Invented Human is not a creature');
    expect(store.listDocuments('actor')).toEqual([]);
  });
});

describe('updating an NPC made from a creature', () => {
  const edit = (changes: Record<string, unknown>, seat: Seat = gm()) => {
    const actor = make();
    return {
      actor,
      updated: () => updateActor(store, seat, { actorId: actor.id, changes }),
    };
  };

  it('lets the GM set current and temporary hit points', () => {
    const { updated } = edit({ 'system.hp.current': 12, 'system.hp.temp': 5 });
    expect(npcDataSchema.parse(updated().system).hp).toEqual({ current: 12, temp: 5 });
  });

  it('lets the GM change the creature’s own copy, the override path for a tougher monster', () => {
    const { updated } = edit({ 'system.creature.hp': 60, 'system.creature.ac': 21 });
    expect(npcDataSchema.parse(updated().system).creature).toMatchObject({
      hp: 60,
      ac: 21,
    });
  });

  it('refuses a change that would leave the payload invalid, writing nothing', () => {
    const { actor, updated } = edit({ 'system.hp.current': -1 });
    expect(updated).toThrow(OperationRejected);
    expect(updated).toThrow('system.hp.current');
    expect(
      npcDataSchema.parse(actorSchema.parse(store.getDocument(actor.id)).system).hp
        .current,
    ).toBe(45);
  });

  it('refuses a change that would remove the creature, and one to an unknown field', () => {
    expect(edit({ 'system.creature': null }).updated).toThrow('invalid change');
    const { updated } = edit({ 'system.notes': 'secret' });
    // Unknown fields are dropped by the schema rather than stored.
    expect('notes' in updated().system).toBe(false);
  });

  it('keeps conditions behind their own operations', () => {
    expect(edit({ 'system.conditions': [{ slug: 'prone' }] }).updated).toThrow(
      'cannot be changed with actor.update',
    );
  });

  it('refuses a player, who cannot even see it', () => {
    expect(edit({ 'system.hp.current': 1 }, player()).updated).toThrow('no actor found');
  });

  it('does not hold a hand-made NPC, which has no creature, to the creature schema', () => {
    const handMade = actorSchema.parse({
      id: crypto.randomUUID(),
      worldId: store.world.id,
      type: 'actor',
      schemaVersion: 1,
      permissions: { default: 'none', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      kind: 'npc',
      name: 'Plain NPC',
      system: {},
    });
    store.putDocument(handMade);
    const updated = updateActor(store, gm(), {
      actorId: handMade.id,
      changes: { 'system.anything': 1 },
    });
    expect(updated.system).toEqual({ anything: 1 });
  });
});
