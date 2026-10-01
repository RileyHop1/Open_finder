import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, Scene, Seat } from '@hearthtable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import { setPartyScene } from './party.js';
import { createScene, updateScene } from './scenes.js';
import {
  createDragLimiter,
  DRAG_PREVIEWS_PER_SECOND,
  previewTokenDrag,
} from './tokenDrag.js';
import { placeToken } from './tokens.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-drag-test-'));
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

describe('createDragLimiter', () => {
  it('lets the first preview through, then drops those that come too soon', () => {
    let clock = 1000;
    const allow = createDragLimiter(30, () => clock);
    expect(allow()).toBe(true);
    clock += 10;
    expect(allow()).toBe(false);
    clock += 10;
    expect(allow()).toBe(false);
  });

  it('lets one through again once the interval has passed, and measures from the last one let through', () => {
    let clock = 0;
    const allow = createDragLimiter(10, () => clock); // one per 100 ms
    expect(allow()).toBe(true); // 0
    clock = 99;
    expect(allow()).toBe(false);
    clock = 100;
    expect(allow()).toBe(true);
    clock = 150;
    expect(allow()).toBe(false); // measured from 100, not from the dropped 99
    clock = 200;
    expect(allow()).toBe(true);
  });

  it('keeps each connection’s limiter separate', () => {
    const clock = 0;
    const a = createDragLimiter(30, () => clock);
    const b = createDragLimiter(30, () => clock);
    expect(a()).toBe(true);
    expect(b()).toBe(true);
    expect(a()).toBe(false);
    expect(b()).toBe(false);
  });

  it('allows about thirty a second by default', () => {
    expect(DRAG_PREVIEWS_PER_SECOND).toBe(30);
    let clock = 0;
    const allow = createDragLimiter(undefined, () => clock);
    let passed = 0;
    for (clock = 0; clock < 1000; clock += 1) {
      if (allow()) {
        passed += 1;
      }
    }
    expect(passed).toBeGreaterThanOrEqual(29);
    expect(passed).toBeLessThanOrEqual(31);
  });
});

describe('previewTokenDrag', () => {
  function setup() {
    const here: Scene = createScene(store, gm(), { name: 'Crypt', kind: 'area' });
    setPartyScene(store, here.id);
    const owner = makeSeat();
    const hero: Actor = createActor(store, owner, { kind: 'character', name: 'Hero' });
    const token = placeToken(store, {
      scene: here,
      actor: hero,
      size: 1,
      x: 350,
      y: 450,
    });
    return { here, owner, hero, token };
  }

  it('relays the owner’s drag, unsnapped, with the token so the caller can pick who sees it', () => {
    const { owner, token } = setup();
    const preview = previewTokenDrag(store, owner, {
      tokenId: token.id,
      x: 712.5,
      y: 833.25,
    });
    expect(preview?.drag).toEqual({ tokenId: token.id, x: 712.5, y: 833.25 });
    expect(preview?.token.id).toBe(token.id);
  });

  it('relays the GM’s drag of any token', () => {
    const { token } = setup();
    expect(
      previewTokenDrag(store, gm(), { tokenId: token.id, x: 1, y: 1 }),
    ).toBeDefined();
  });

  it('keeps the point on the token’s scene, so a client cannot send one off the map', () => {
    const { owner, token } = setup();
    const preview = previewTokenDrag(store, owner, {
      tokenId: token.id,
      x: 30000,
      y: 25000,
    });
    expect(preview?.drag).toMatchObject({ x: 2000, y: 2000 });
  });

  it('uses the scene’s own size for that limit', () => {
    const { here, owner, token } = setup();
    updateScene(store, gm(), { sceneId: here.id, changes: { width: 500, height: 300 } });
    expect(
      previewTokenDrag(store, owner, { tokenId: token.id, x: 900, y: 900 })?.drag,
    ).toMatchObject({ x: 500, y: 300 });
  });

  it('drops a drag by someone who does not own the token’s actor', () => {
    const { token } = setup();
    expect(
      previewTokenDrag(store, makeSeat(), { tokenId: token.id, x: 1, y: 1 }),
    ).toBeUndefined();
  });

  it('drops a drag of a token the seat cannot see, even for their own actor', () => {
    const { here, owner, hero } = setup();
    const hidden = placeToken(store, {
      scene: here,
      actor: hero,
      size: 1,
      x: 50,
      y: 50,
      hidden: true,
    });
    expect(
      previewTokenDrag(store, owner, { tokenId: hidden.id, x: 1, y: 1 }),
    ).toBeUndefined();
    expect(
      previewTokenDrag(store, gm(), { tokenId: hidden.id, x: 1, y: 1 }),
    ).toBeDefined();
  });

  it('drops a drag with no seat, an unknown token, an id that is not a token, and malformed data', () => {
    const { owner, hero, token } = setup();
    const at = { x: 1, y: 1 };
    expect(
      previewTokenDrag(store, undefined, { tokenId: token.id, ...at }),
    ).toBeUndefined();
    expect(
      previewTokenDrag(store, owner, { tokenId: crypto.randomUUID(), ...at }),
    ).toBeUndefined();
    expect(previewTokenDrag(store, owner, { tokenId: hero.id, ...at })).toBeUndefined();
    for (const bad of [
      undefined,
      null,
      'drag',
      {},
      { tokenId: token.id },
      { tokenId: 'nope', ...at },
      { tokenId: token.id, x: -1, y: 1 },
      { tokenId: token.id, x: Number.NaN, y: 1 },
      { tokenId: token.id, x: '5', y: 1 },
    ]) {
      expect(previewTokenDrag(store, owner, bad)).toBeUndefined();
    }
  });

  it('writes nothing: the token stays where it was', () => {
    const { owner, token } = setup();
    previewTokenDrag(store, owner, { tokenId: token.id, x: 900, y: 900 });
    expect(store.getDocument(token.id)).toMatchObject({ x: 350, y: 450 });
  });
});
