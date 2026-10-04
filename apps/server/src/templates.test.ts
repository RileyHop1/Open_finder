import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BaseDocument, Seat } from '@hearthtable/core';
import { canReadDocument } from '@hearthtable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import { OperationRejected } from './rejection.js';
import { createScene, deleteScene } from './scenes.js';
import { creaturesCaught, placeTemplate, removeTemplate } from './templates.js';
import { placeToken } from './tokens.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-template-test-'));
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
    name: 'GM',
    isGM: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Default grid: 100 px squares, 5 ft. Square (col, row) is centred at (50 + 100 col, 50 + 100 row). */
function table() {
  const gm = makeSeat();
  const player = makeSeat({ name: 'Ada', isGM: false });
  const scene = createScene(store, gm, { name: 'Crypt', kind: 'battle' });
  const put = (name: string, col: number, row: number, hidden = false) => {
    const actor = createActor(store, gm, { kind: 'character', name });
    return placeToken(store, {
      scene,
      actor,
      size: 1,
      x: 50 + 100 * col,
      y: 50 + 100 * row,
      hidden,
    });
  };
  return { gm, player, scene, put };
}

describe('placeTemplate', () => {
  it('stores a template everyone can read and lists the creatures caught', () => {
    const { gm, player, scene, put } = table();
    const near = put('Goblin', 3, 2);
    put('Far Goblin', 6, 2);
    const { template, messages } = placeTemplate(store, player, {
      sceneId: scene.id,
      shape: 'burst',
      at: { x: 250, y: 250 },
      feet: 5,
      label: 'Fireball',
    });
    expect(canReadDocument(gm, template as BaseDocument)).toBe(true);
    expect(canReadDocument(player, template as BaseDocument)).toBe(true);
    expect(creaturesCaught(store, template).map((t) => t.id)).toEqual([near.id]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe(
      'Ada placed Fireball (5-foot burst): caught ' +
        (store.getDocument(near.actorId) as { name: string }).name +
        '.',
    );
  });

  it('says so when nothing is caught', () => {
    const { gm, scene } = table();
    const { messages } = placeTemplate(store, gm, {
      sceneId: scene.id,
      shape: 'burst',
      at: { x: 250, y: 250 },
      feet: 5,
    });
    expect(messages[0]?.text).toBe(
      'GM placed an area (5-foot burst): no creatures caught.',
    );
  });

  it('names a hidden creature only in a GM-only line', () => {
    const { gm, player, scene, put } = table();
    put('Lurker', 3, 2, true);
    const { messages } = placeTemplate(store, gm, {
      sceneId: scene.id,
      shape: 'burst',
      at: { x: 250, y: 250 },
      feet: 5,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.text).not.toContain('Lurker');
    expect(canReadDocument(player, messages[0] as BaseDocument)).toBe(true);
    expect(messages[1]?.text).toContain('Lurker');
    expect(canReadDocument(player, messages[1] as BaseDocument)).toBe(false);
    expect(canReadDocument(gm, messages[1] as BaseDocument)).toBe(true);
  });

  it('catches by cone, line and emanation too', () => {
    const { gm, scene, put } = table();
    const source = put('Mage', 2, 2);
    const ahead = put('Ahead', 4, 2);
    const beside = put('Beside', 2, 5);
    const at = { x: 250, y: 250 };
    const caught = (payload: Parameters<typeof placeTemplate>[2]) =>
      creaturesCaught(store, placeTemplate(store, gm, payload).template).map((t) => t.id);

    expect(
      caught({ sceneId: scene.id, shape: 'cone', at, to: { x: 650, y: 250 }, feet: 20 }),
    ).toContain(ahead.id);
    expect(
      caught({ sceneId: scene.id, shape: 'cone', at, to: { x: 650, y: 250 }, feet: 20 }),
    ).not.toContain(beside.id);
    expect(
      caught({ sceneId: scene.id, shape: 'line', at, to: { x: 650, y: 250 }, feet: 20 }),
    ).toEqual(expect.arrayContaining([source.id, ahead.id]));
    expect(
      caught({ sceneId: scene.id, shape: 'emanation', at, feet: 5, tokenId: source.id }),
    ).toEqual([source.id]);
    expect(
      caught({ sceneId: scene.id, shape: 'emanation', at, feet: 10, tokenId: source.id }),
    ).toEqual(expect.arrayContaining([source.id, ahead.id]));
  });

  it("a line's reach is its own feet, not the distance the GM dragged the aim point", () => {
    const { gm, scene, put } = table();
    const source = put('Mage', 2, 2);
    const ahead = put('Ahead', 4, 2);
    const farBeyond = put('Far beyond', 20, 2);
    const at = { x: 250, y: 250 };
    const caught = (payload: Parameters<typeof placeTemplate>[2]) =>
      creaturesCaught(store, placeTemplate(store, gm, payload).template).map((t) => t.id);

    // Aimed just past "Ahead", 20 feet matches the distance to the aim point.
    const atAimDistance = caught({
      sceneId: scene.id,
      shape: 'line',
      at,
      to: { x: 650, y: 250 },
      feet: 20,
    });
    // Same feet, but dragged far past "Far beyond": the reach must not grow.
    const draggedFar = caught({
      sceneId: scene.id,
      shape: 'line',
      at,
      to: { x: 5250, y: 250 },
      feet: 20,
    });
    expect(atAimDistance).toEqual(expect.arrayContaining([source.id, ahead.id]));
    expect(draggedFar).toEqual(expect.arrayContaining([source.id, ahead.id]));
    expect(draggedFar).not.toContain(farBeyond.id);
  });

  it('rejects a gridless scene, a cone with no aim, and an emanation with no token', () => {
    const { gm, scene } = table();
    const base = { sceneId: scene.id, at: { x: 250, y: 250 }, feet: 15 };
    expect(() => placeTemplate(store, gm, { ...base, shape: 'cone' })).toThrow(
      OperationRejected,
    );
    expect(() => placeTemplate(store, gm, { ...base, shape: 'emanation' })).toThrow(
      OperationRejected,
    );
    store.putDocument({
      ...(store.getDocument(scene.id) as BaseDocument),
      grid: { type: 'none', size: 100, distance: 5 },
    } as BaseDocument);
    expect(() => placeTemplate(store, gm, { ...base, shape: 'burst' })).toThrow(
      /gridded/,
    );
  });

  it('applies nothing to a creature it catches', () => {
    const { gm, scene, put } = table();
    const token = put('Goblin', 3, 2);
    const before = JSON.stringify(store.getDocument(token.actorId));
    placeTemplate(store, gm, {
      sceneId: scene.id,
      shape: 'burst',
      at: { x: 250, y: 250 },
      feet: 5,
    });
    expect(JSON.stringify(store.getDocument(token.actorId))).toBe(before);
  });
});

describe('removeTemplate', () => {
  const place = () => {
    const t = table();
    const { template } = placeTemplate(store, t.player, {
      sceneId: t.scene.id,
      shape: 'burst',
      at: { x: 250, y: 250 },
      feet: 5,
    });
    return { ...t, template };
  };

  it('lets the seat that placed it, or the GM, remove it', () => {
    const a = place();
    expect(removeTemplate(store, a.player, { templateId: a.template.id })).toBeDefined();
    expect(store.getDocument(a.template.id)).toBeUndefined();
    const b = place();
    expect(removeTemplate(store, b.gm, { templateId: b.template.id })).toBeDefined();
  });

  it('refuses another player and tolerates one already gone', () => {
    const { template } = place();
    const stranger = makeSeat({ name: 'Cy', isGM: false });
    expect(() => removeTemplate(store, stranger, { templateId: template.id })).toThrow(
      OperationRejected,
    );
    expect(removeTemplate(store, makeSeat(), { templateId: 'missing' })).toBeUndefined();
  });

  it('goes with its scene when the scene is deleted', () => {
    const { gm, scene, template } = place();
    const { deleted } = deleteScene(store, gm, { sceneId: scene.id });
    expect(deleted.map((d) => d.id)).toContain(template.id);
    expect(store.getDocument(template.id)).toBeUndefined();
  });
});
