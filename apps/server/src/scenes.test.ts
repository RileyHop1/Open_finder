import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Party, Scene, Seat } from '@hearthtable/core';
import {
  partySchema,
  resolvePermission,
  sceneSchema,
  tokenSchema,
} from '@hearthtable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addPartyMember } from './party.js';
import { createActor } from './actors.js';
import { OperationRejected } from './rejection.js';
import { createScene, deleteScene, updateScene } from './scenes.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-scenes-test-'));
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

const stored = (id: string) => sceneSchema.parse(store.getDocument(id));

/** Seeds a token document, which no operation can create yet. */
function seedToken(sceneId: string): string {
  const id = crypto.randomUUID();
  const token = tokenSchema.parse({
    id,
    worldId: store.world.id,
    type: 'token',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    sceneId,
    actorId: crypto.randomUUID(),
    x: 100,
    y: 100,
    size: 1,
    hidden: false,
  });
  store.putDocument(token);
  return id;
}

describe('createScene', () => {
  it('stores a blank, default-grid scene that players cannot read', () => {
    const seat = gm();
    const scene = createScene(store, seat, { name: 'The Crypt', kind: 'battle' });
    expect(scene).toMatchObject({
      type: 'scene',
      name: 'The Crypt',
      kind: 'battle',
      width: 2000,
      height: 2000,
      links: [],
      grid: { type: 'square', size: 100, distance: 5, offsetX: 0, offsetY: 0 },
      permissions: { default: 'none', seats: {} },
    });
    expect(scene.background).toBeUndefined();
    expect(stored(scene.id)).toEqual(scene);
    // Hidden from a player, but the GM always owns it.
    expect(resolvePermission(player(), scene)).toBe('none');
    expect(resolvePermission(gm(), scene)).toBe('owner');
  });

  it('refuses a player', () => {
    expect(() => createScene(store, player(), { name: 'x', kind: 'area' })).toThrow(
      OperationRejected,
    );
    expect(store.listDocuments('scene')).toEqual([]);
  });
});

describe('updateScene', () => {
  const background = `${'a'.repeat(64)}.png`;

  function sceneToChange(): Scene {
    return createScene(store, gm(), { name: 'The Crypt', kind: 'battle' });
  }

  it('changes the name, kind, and size, and stamps updatedAt', () => {
    const scene = sceneToChange();
    const updated = updateScene(store, gm(), {
      sceneId: scene.id,
      changes: { name: 'Renamed', kind: 'area', width: 4000, height: 3000 },
    });
    expect(updated).toMatchObject({
      name: 'Renamed',
      kind: 'area',
      width: 4000,
      height: 3000,
    });
    expect(updated.updatedAt >= scene.updatedAt).toBe(true);
    expect(stored(scene.id)).toEqual(updated);
  });

  it('merges the grid field by field, so changing the cell size keeps the offset', () => {
    const scene = sceneToChange();
    updateScene(store, gm(), {
      sceneId: scene.id,
      changes: { grid: { offsetX: 25, distance: 10 } },
    });
    const updated = updateScene(store, gm(), {
      sceneId: scene.id,
      changes: { grid: { size: 70 } },
    });
    expect(updated.grid).toEqual({
      type: 'square',
      size: 70,
      distance: 10,
      offsetX: 25,
      offsetY: 0,
    });
  });

  it('sets a background from an uploaded image name, and clears it with null', () => {
    const scene = sceneToChange();
    expect(
      updateScene(store, gm(), { sceneId: scene.id, changes: { background } }).background,
    ).toBe(background);
    const cleared = updateScene(store, gm(), {
      sceneId: scene.id,
      changes: { background: null },
    });
    expect(cleared.background).toBeUndefined();
    expect('background' in stored(scene.id)).toBe(false);
  });

  it('refuses a background that is not an uploaded image name, writing nothing', () => {
    const scene = sceneToChange();
    for (const bad of [
      'map.png',
      '../../etc/passwd',
      `${'a'.repeat(64)}.svg`,
      'a'.repeat(64),
    ]) {
      expect(() =>
        updateScene(store, gm(), { sceneId: scene.id, changes: { background: bad } }),
      ).toThrow(OperationRejected);
    }
    expect(stored(scene.id).background).toBeUndefined();
  });

  it('refuses a player, and a scene that does not exist or is not a scene', () => {
    const scene = sceneToChange();
    expect(() =>
      updateScene(store, player(), { sceneId: scene.id, changes: { name: 'Hijack' } }),
    ).toThrow('only the GM');
    expect(stored(scene.id).name).toBe('The Crypt');

    expect(() =>
      updateScene(store, gm(), { sceneId: crypto.randomUUID(), changes: { name: 'x' } }),
    ).toThrow('no scene found');
    const actor = createActor(store, gm(), { kind: 'character', name: 'Hero' });
    expect(() =>
      updateScene(store, gm(), { sceneId: actor.id, changes: { name: 'x' } }),
    ).toThrow('no scene found');
  });
});

describe('deleteScene', () => {
  it('removes the scene and reports its bare envelope', () => {
    const scene = createScene(store, gm(), { name: 'The Crypt', kind: 'battle' });
    const { deleted, changed } = deleteScene(store, gm(), { sceneId: scene.id });
    expect(store.getDocument(scene.id)).toBeUndefined();
    expect(deleted.map((d) => d.id)).toEqual([scene.id]);
    expect(deleted[0]).not.toHaveProperty('grid');
    expect(changed).toEqual([]);
  });

  it('takes the scene’s tokens with it, and leaves other scenes’ tokens', () => {
    const doomed = createScene(store, gm(), { name: 'Doomed', kind: 'battle' });
    const kept = createScene(store, gm(), { name: 'Kept', kind: 'battle' });
    const a = seedToken(doomed.id);
    const b = seedToken(doomed.id);
    const survivor = seedToken(kept.id);

    const { deleted } = deleteScene(store, gm(), { sceneId: doomed.id });

    expect(deleted.map((d) => d.id).sort()).toEqual([doomed.id, a, b].sort());
    expect(store.getDocument(a)).toBeUndefined();
    expect(store.getDocument(b)).toBeUndefined();
    expect(store.getDocument(survivor)).toBeDefined();
  });

  it('clears the party’s scene when the party was there, and not otherwise', () => {
    const gmSeat = gm();
    const here = createScene(store, gmSeat, { name: 'Here', kind: 'area' });
    const elsewhere = createScene(store, gmSeat, { name: 'Elsewhere', kind: 'area' });
    const hero = createActor(store, gmSeat, { kind: 'character', name: 'Hero' });
    addPartyMember(store, gmSeat, { actorId: hero.id });
    const [rawParty] = store.listDocuments('party');
    const party = partySchema.parse(rawParty);
    const placed: Party = { ...party, sceneId: here.id };
    store.putDocument(placed);

    expect(deleteScene(store, gmSeat, { sceneId: elsewhere.id }).changed).toEqual([]);
    expect(partySchema.parse(store.listDocuments('party')[0]).sceneId).toBe(here.id);

    const { changed } = deleteScene(store, gmSeat, { sceneId: here.id });
    expect(changed).toHaveLength(1);
    const after = partySchema.parse(store.listDocuments('party')[0]);
    expect(after.sceneId).toBeUndefined();
    expect('sceneId' in after).toBe(false);
    expect(after.memberIds).toEqual([hero.id]);
  });

  it('removes other scenes’ exits into it, and keeps their other exits', () => {
    const gmSeat = gm();
    const doomed = createScene(store, gmSeat, { name: 'Doomed', kind: 'area' });
    const safe = createScene(store, gmSeat, { name: 'Safe', kind: 'area' });
    const hub = createScene(store, gmSeat, { name: 'Hub', kind: 'overworld' });
    const toDoomed = {
      id: crypto.randomUUID(),
      label: 'Down',
      x: 10,
      y: 10,
      targetSceneId: doomed.id,
    };
    const toSafe = {
      id: crypto.randomUUID(),
      label: 'Out',
      x: 20,
      y: 20,
      targetSceneId: safe.id,
    };
    const linked: Scene = { ...hub, links: [toDoomed, toSafe] };
    store.putDocument(linked);

    const { changed } = deleteScene(store, gmSeat, { sceneId: doomed.id });

    expect(changed.map((d) => d.id)).toEqual([hub.id]);
    expect(stored(hub.id).links).toEqual([toSafe]);
  });

  it('refuses a player and an unknown scene, deleting nothing', () => {
    const scene = createScene(store, gm(), { name: 'The Crypt', kind: 'battle' });
    expect(() => deleteScene(store, player(), { sceneId: scene.id })).toThrow(
      'only the GM',
    );
    expect(store.getDocument(scene.id)).toBeDefined();
    expect(() => deleteScene(store, gm(), { sceneId: crypto.randomUUID() })).toThrow(
      'no scene found',
    );
  });
});
