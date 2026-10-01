import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, Scene, Seat, Token } from '@hearthtable/core';
import { actorSchema, partySchema, sceneSchema, tokenSchema } from '@hearthtable/core';
import type { CreatureEntry, Pf2eEntry } from '@hearthtable/pf2e';
import {
  ancestryEntrySchema,
  newCharacterData,
  newNpcFromCreature,
} from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CompendiumIndex } from './compendium.js';
import { addPartyMember } from './party.js';
import { OperationRejected } from './rejection.js';
import { activateScene, createScene } from './scenes.js';
import { placeToken } from './tokens.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-activate-test-'));
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

function ancestry(slug: string, size: string): Pf2eEntry {
  return ancestryEntrySchema.parse({
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'ancestries',
    slug,
    name: slug,
    kind: 'ancestry',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    hp: 8,
    size,
    speed: 25,
  });
}

const compendium = compendiumOf([
  ancestry('invented-halfling', 'small'),
  ancestry('invented-giant', 'large'),
]);

function actorOf(
  kind: Actor['kind'],
  name: string,
  system: Record<string, unknown>,
): Actor {
  const actor = actorSchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind,
    name,
    system,
  });
  store.putDocument(actor);
  return actor;
}

/** A character, optionally with an ancestry that names a compendium entry. */
function character(name: string, ancestrySlug?: string): Actor {
  const data = newCharacterData();
  return actorOf('character', name, {
    ...data,
    ...(ancestrySlug === undefined
      ? {}
      : {
          ancestry: {
            name: ancestrySlug,
            source: { packId: 'ancestries', slug: ancestrySlug },
          },
        }),
  });
}

function creature(size: CreatureEntry['size']): CreatureEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'bestiary',
    slug: `invented-${size}`,
    name: `Invented ${size}`,
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
    size,
    perception: 8,
    ac: 19,
    savingThrows: { fortitude: 10, reflex: 6, will: 7 },
    hp: 45,
    resistances: [],
    weaknesses: [],
    speeds: { land: 25 },
    attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
    skills: {},
    strikes: [],
    languages: [],
  };
}

const sceneNamed = (seat: Seat, name: string): Scene =>
  createScene(store, seat, { name, kind: 'area' });

const tokens = (): Token[] =>
  store.listDocuments('token').map((raw) => tokenSchema.parse(raw));

const storedScene = (id: string) => sceneSchema.parse(store.getDocument(id));

const storedParty = () => partySchema.parse(store.listDocuments('party')[0]);

function join_(seat: Seat, ...members: Actor[]): void {
  for (const member of members) {
    addPartyMember(store, seat, { actorId: member.id });
  }
}

describe('activateScene', () => {
  it('puts the party in the scene, creating the party if there is none, and reveals the scene', () => {
    const seat = gm();
    const scene = sceneNamed(seat, 'Crypt');
    expect(store.listDocuments('party')).toEqual([]);

    const changed = activateScene(store, compendium, seat, { sceneId: scene.id });

    expect(storedParty().sceneId).toBe(scene.id);
    expect(storedScene(scene.id).permissions.default).toBe('observer');
    expect(changed.map((d) => d.type).sort()).toEqual(['party', 'scene']);
  });

  it('hides the scene the party left, and leaves a scene it was never in alone', () => {
    const seat = gm();
    const first = sceneNamed(seat, 'First');
    const second = sceneNamed(seat, 'Second');
    const bystander = sceneNamed(seat, 'Bystander');

    activateScene(store, compendium, seat, { sceneId: first.id });
    expect(storedScene(first.id).permissions.default).toBe('observer');
    activateScene(store, compendium, seat, { sceneId: second.id });

    expect(storedScene(first.id).permissions.default).toBe('none');
    expect(storedScene(second.id).permissions.default).toBe('observer');
    expect(storedScene(bystander.id).permissions.default).toBe('none');
    expect(storedParty().sceneId).toBe(second.id);
  });

  it('places a token for every party member in a row at the scene centre, snapped to the grid', () => {
    const seat = gm();
    const scene = sceneNamed(seat, 'Crypt');
    const a = character('Amiri');
    const b = character('Kyra');
    const c = character('Merisiel');
    join_(seat, a, b, c);

    activateScene(store, compendium, seat, { sceneId: scene.id });

    const placed = tokens();
    expect(placed.map((t) => t.actorId).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(new Set(placed.map((t) => t.sceneId))).toEqual(new Set([scene.id]));
    // A contiguous row of cell centres around the 1000,1000 centre of the 2000px scene.
    const row = placed.map((t) => [t.x, t.y]).sort((p, q) => (p[0] ?? 0) - (q[0] ?? 0));
    expect(row).toEqual([
      [950, 1050],
      [1050, 1050],
      [1150, 1050],
    ]);
    // Placed in party order, left to right.
    expect(placed.sort((p, q) => p.x - q.x).map((t) => t.actorId)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
  });

  it('places the party at the arrival point it is given', () => {
    const seat = gm();
    const scene = sceneNamed(seat, 'Crypt');
    join_(seat, character('Amiri'));

    activateScene(store, compendium, seat, { sceneId: scene.id, at: { x: 350, y: 450 } });

    expect(tokens().map((t) => [t.x, t.y])).toEqual([[350, 450]]);
  });

  it('keeps an arrival at the edge of the scene on the scene', () => {
    const seat = gm();
    const scene = sceneNamed(seat, 'Crypt');
    join_(seat, character('Amiri'), character('Kyra'));

    activateScene(store, compendium, seat, { sceneId: scene.id, at: { x: 0, y: 2000 } });

    for (const token of tokens()) {
      expect(token.x).toBeGreaterThanOrEqual(0);
      expect(token.x).toBeLessThanOrEqual(2000);
      expect(token.y).toBeLessThanOrEqual(2000);
    }
  });

  it('sizes a token from the creature for an NPC, the ancestry for a character, and one square otherwise', () => {
    const seat = gm();
    const scene = sceneNamed(seat, 'Crypt');
    const ogre = actorOf('npc', 'Ogre', { ...newNpcFromCreature(creature('huge')) });
    const halfling = character('Halfling', 'invented-halfling');
    const giant = character('Giant', 'invented-giant');
    const plain = character('Plain');
    const unknown = character('Mystery', 'not-in-the-compendium');
    join_(seat, ogre, halfling, giant, plain, unknown);

    activateScene(store, compendium, seat, { sceneId: scene.id });

    const sizeOf = (actor: Actor) => tokens().find((t) => t.actorId === actor.id)?.size;
    expect(sizeOf(ogre)).toBe(3);
    expect(sizeOf(halfling)).toBe(1);
    expect(sizeOf(giant)).toBe(2);
    expect(sizeOf(plain)).toBe(1);
    expect(sizeOf(unknown)).toBe(1);
  });

  it('makes the party’s tokens visible, keeps a hidden token hidden, and shows the GM’s visible ones', () => {
    const seat = gm();
    const scene = sceneNamed(seat, 'Crypt');
    const hero = character('Amiri');
    const lurker = actorOf('npc', 'Lurker', {
      ...newNpcFromCreature(creature('medium')),
    });
    const guard = actorOf('npc', 'Guard', { ...newNpcFromCreature(creature('medium')) });
    join_(seat, hero);
    // Pre-placed by the GM before the party arrives: one hidden, one not. Neither is visible yet.
    placeToken(store, { scene, actor: lurker, size: 1, x: 100, y: 100, hidden: true });
    placeToken(store, { scene, actor: guard, size: 1, x: 200, y: 100 });
    expect(tokens().every((t) => t.permissions.default === 'none')).toBe(true);

    activateScene(store, compendium, seat, { sceneId: scene.id });

    const byActor = (actor: Actor) => tokens().find((t) => t.actorId === actor.id);
    expect(byActor(hero)?.permissions.default).toBe('observer');
    expect(byActor(guard)?.permissions.default).toBe('observer');
    expect(byActor(lurker)?.permissions.default).toBe('none');
    expect(byActor(lurker)?.hidden).toBe(true);
  });

  it('hides the tokens of the scene the party left', () => {
    const seat = gm();
    const first = sceneNamed(seat, 'First');
    const second = sceneNamed(seat, 'Second');
    const hero = character('Amiri');
    join_(seat, hero);

    activateScene(store, compendium, seat, { sceneId: first.id });
    const heroHere = tokens().find((t) => t.sceneId === first.id);
    expect(heroHere?.permissions.default).toBe('observer');

    const changed = activateScene(store, compendium, seat, { sceneId: second.id });

    expect(tokens().find((t) => t.id === heroHere?.id)?.permissions.default).toBe('none');
    expect(tokens().find((t) => t.sceneId === second.id)?.permissions.default).toBe(
      'observer',
    );
    // The old token was changed, so it rides in the broadcast and can be revoked.
    expect(changed.map((d) => d.id)).toContain(heroHere?.id);
  });

  it('does not place a second token for a member who already has one here', () => {
    const seat = gm();
    const scene = sceneNamed(seat, 'Crypt');
    const hero = character('Amiri');
    const newcomer = character('Kyra');
    join_(seat, hero);
    activateScene(store, compendium, seat, { sceneId: scene.id });
    join_(seat, newcomer);

    activateScene(store, compendium, seat, { sceneId: scene.id });

    expect(tokens().filter((t) => t.actorId === hero.id)).toHaveLength(1);
    expect(tokens().filter((t) => t.actorId === newcomer.id)).toHaveLength(1);
  });

  it('puts a member who was already placed elsewhere on the new scene too', () => {
    const seat = gm();
    const first = sceneNamed(seat, 'First');
    const second = sceneNamed(seat, 'Second');
    join_(seat, character('Amiri'));

    activateScene(store, compendium, seat, { sceneId: first.id });
    activateScene(store, compendium, seat, { sceneId: second.id });

    expect(
      tokens()
        .map((t) => t.sceneId)
        .sort(),
    ).toEqual([first.id, second.id].sort());
  });

  it('skips a party member whose actor no longer exists', () => {
    const seat = gm();
    const scene = sceneNamed(seat, 'Crypt');
    const hero = character('Amiri');
    join_(seat, hero);
    store.deleteDocument(hero.id);

    expect(() =>
      activateScene(store, compendium, seat, { sceneId: scene.id }),
    ).not.toThrow();
    expect(tokens()).toEqual([]);
  });

  it('refuses a player, an unknown scene, and an arrival off the scene, changing nothing', () => {
    const seat = gm();
    const scene = sceneNamed(seat, 'Crypt');
    join_(seat, character('Amiri'));

    expect(() =>
      activateScene(store, compendium, makeSeat(), { sceneId: scene.id }),
    ).toThrow('only the GM');
    expect(() =>
      activateScene(store, compendium, seat, { sceneId: crypto.randomUUID() }),
    ).toThrow('no scene found');
    expect(() =>
      activateScene(store, compendium, seat, {
        sceneId: scene.id,
        at: { x: 2001, y: 5 },
      }),
    ).toThrow(OperationRejected);

    expect(storedParty().sceneId).toBeUndefined();
    expect(storedScene(scene.id).permissions.default).toBe('none');
    expect(tokens()).toEqual([]);
  });
});
