import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { sceneSchema } from '@hearthtable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import { addSceneLink, createScene, removeSceneLink, updateScene } from './scenes.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-scene-links-test-'));
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

function twoScenes() {
  const gmSeat = gm();
  return {
    gmSeat,
    here: createScene(store, gmSeat, { name: 'Here', kind: 'area' }),
    there: createScene(store, gmSeat, { name: 'There', kind: 'area' }),
  };
}

describe('addSceneLink', () => {
  it('adds an exit with a server-issued id, and keeps the others in order', () => {
    const { gmSeat, here, there } = twoScenes();
    const first = addSceneLink(store, gmSeat, {
      sceneId: here.id,
      label: 'To the cellar',
      x: 400,
      y: 250,
      targetSceneId: there.id,
    });
    const second = addSceneLink(store, gmSeat, {
      sceneId: here.id,
      label: 'Trapdoor',
      x: 10,
      y: 20,
      targetSceneId: there.id,
    });

    expect(first.links).toHaveLength(1);
    expect(first.links[0]).toMatchObject({
      label: 'To the cellar',
      x: 400,
      y: 250,
      targetSceneId: there.id,
    });
    expect(second.links.map((l) => l.label)).toEqual(['To the cellar', 'Trapdoor']);
    // Two exits to the same place get distinct ids.
    expect(new Set(second.links.map((l) => l.id)).size).toBe(2);
    expect(stored(here.id)).toEqual(second);
  });

  it('allows a point on the scene edge and refuses one beyond it, writing nothing', () => {
    const { gmSeat, here, there } = twoScenes();
    const at = (x: number, y: number) => ({
      sceneId: here.id,
      label: 'Edge',
      x,
      y,
      targetSceneId: there.id,
    });
    expect(addSceneLink(store, gmSeat, at(2000, 2000)).links).toHaveLength(1);
    expect(() => addSceneLink(store, gmSeat, at(2001, 10))).toThrow(
      'must be on the scene',
    );
    expect(() => addSceneLink(store, gmSeat, at(10, 2001))).toThrow(
      'must be on the scene',
    );
    expect(stored(here.id).links).toHaveLength(1);
  });

  it("uses the scene's own size for the bounds", () => {
    const { gmSeat, here, there } = twoScenes();
    updateScene(store, gmSeat, {
      sceneId: here.id,
      changes: { width: 500, height: 300 },
    });
    const at = (x: number, y: number) => ({
      sceneId: here.id,
      label: 'Edge',
      x,
      y,
      targetSceneId: there.id,
    });
    expect(() => addSceneLink(store, gmSeat, at(501, 100))).toThrow('0 to 500 across');
    expect(() => addSceneLink(store, gmSeat, at(100, 301))).toThrow('0 to 300 down');
    expect(addSceneLink(store, gmSeat, at(500, 300)).links).toHaveLength(1);
  });

  it('refuses a link to the same scene, to a scene that does not exist, or to a non-scene', () => {
    const { gmSeat, here } = twoScenes();
    const to = (targetSceneId: string) => ({
      sceneId: here.id,
      label: 'x',
      x: 1,
      y: 1,
      targetSceneId,
    });
    expect(() => addSceneLink(store, gmSeat, to(here.id))).toThrow('cannot lead back');
    expect(() => addSceneLink(store, gmSeat, to(crypto.randomUUID()))).toThrow(
      'no scene found',
    );
    const actor = createActor(store, gmSeat, { kind: 'character', name: 'Hero' });
    expect(() => addSceneLink(store, gmSeat, to(actor.id))).toThrow('no scene found');
    expect(stored(here.id).links).toEqual([]);
  });

  it('refuses a player and an unknown scene', () => {
    const { here, there } = twoScenes();
    const payload = {
      sceneId: here.id,
      label: 'x',
      x: 1,
      y: 1,
      targetSceneId: there.id,
    };
    expect(() => addSceneLink(store, player(), payload)).toThrow('only the GM');
    expect(() =>
      addSceneLink(store, gm(), { ...payload, sceneId: crypto.randomUUID() }),
    ).toThrow('no scene found');
    expect(stored(here.id).links).toEqual([]);
  });
});

describe('removeSceneLink', () => {
  function sceneWithTwoExits() {
    const { gmSeat, here, there } = twoScenes();
    const add = (label: string) =>
      addSceneLink(store, gmSeat, {
        sceneId: here.id,
        label,
        x: 10,
        y: 10,
        targetSceneId: there.id,
      });
    add('One');
    return { gmSeat, here, links: add('Two').links };
  }

  it('removes one exit and keeps the rest', () => {
    const { gmSeat, here, links } = sceneWithTwoExits();
    const updated = removeSceneLink(store, gmSeat, {
      sceneId: here.id,
      linkId: links[0]?.id ?? '',
    });
    expect(updated?.links.map((l) => l.label)).toEqual(['Two']);
    expect(stored(here.id).links.map((l) => l.label)).toEqual(['Two']);
  });

  it('is not an error to remove an exit that is already gone, and writes nothing', () => {
    const { gmSeat, here } = sceneWithTwoExits();
    const before = stored(here.id);
    expect(
      removeSceneLink(store, gmSeat, { sceneId: here.id, linkId: crypto.randomUUID() }),
    ).toBeUndefined();
    expect(stored(here.id)).toEqual(before);
  });

  it('refuses a player and an unknown scene', () => {
    const { here, links } = sceneWithTwoExits();
    const linkId = links[0]?.id ?? '';
    expect(() => removeSceneLink(store, player(), { sceneId: here.id, linkId })).toThrow(
      'only the GM',
    );
    expect(() =>
      removeSceneLink(store, gm(), { sceneId: crypto.randomUUID(), linkId }),
    ).toThrow('no scene found');
    expect(stored(here.id).links).toHaveLength(2);
  });
});
