import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ActiveWorldManager, createActiveWorldManager } from './activeWorld.js';
import { createApp } from './app.js';
import { type ContentImporter, type ImportState } from './contentImport.js';
import { createWorld } from './worldStore.js';

let worldsRoot: string;
let activeWorld: ActiveWorldManager;
let app: FastifyInstance;
let importer: FakeImporter;

class FakeImporter implements ContentImporter {
  current: ImportState = { state: 'idle' };
  starts = 0;
  status(): ImportState {
    return this.current;
  }
  start(): 'started' | 'already-running' {
    if (this.current.state === 'running') {
      return 'already-running';
    }
    this.starts += 1;
    this.current = { state: 'running', startedAt: '2026-09-30T00:00:00.000Z' };
    return 'started';
  }
}

const NOW = '2026-09-30T00:00:00.000Z';

function seatWorld() {
  const store = createWorld(worldsRoot, 'Test Campaign');
  const seat = (name: string, isGM: boolean, token: string) =>
    store.putSeat({
      id: crypto.randomUUID(),
      worldId: store.world.id,
      schemaVersion: 1,
      name,
      isGM,
      claimedByDeviceToken: token,
      createdAt: NOW,
      updatedAt: NOW,
    });
  seat('GM', true, 'gm-token');
  seat('Player', false, 'player-token');
  store.close();
  return store.world.id;
}

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-content-import-test-'));
  activeWorld = createActiveWorldManager();
  importer = new FakeImporter();
  app = createApp({ worldsRoot, activeWorld, contentImport: importer, logger: false });
});

afterEach(async () => {
  await app.close();
  activeWorld.clear();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const post = (token?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/compendium/import',
    ...(token === undefined ? {} : { headers: { 'x-device-token': token } }),
  });

describe('POST /api/compendium/import', () => {
  it('starts an import for the GM and answers 202 with the running state', async () => {
    activeWorld.set(worldsRoot, seatWorld());
    const response = await post('gm-token');
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ state: 'running' });
    expect(importer.starts).toBe(1);
  });

  it('answers 409 and does not start a second one while one is running', async () => {
    activeWorld.set(worldsRoot, seatWorld());
    await post('gm-token');
    const again = await post('gm-token');
    expect(again.statusCode).toBe(409);
    expect(importer.starts).toBe(1);
  });

  it('refuses a player, an unknown device, and a caller with no token', async () => {
    activeWorld.set(worldsRoot, seatWorld());
    for (const token of ['player-token', 'stranger', undefined]) {
      const response = await post(token);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'only the GM can import game content' });
    }
    expect(importer.starts).toBe(0);
  });

  it('refuses when no campaign is active, since there is no GM to be', async () => {
    seatWorld();
    expect((await post('gm-token')).statusCode).toBe(403);
    expect(importer.starts).toBe(0);
  });
});

describe('GET /api/compendium/import', () => {
  it('reports the state to anyone, with no token', async () => {
    const idle = await app.inject({ method: 'GET', url: '/api/compendium/import' });
    expect(idle.json()).toEqual({ state: 'idle' });

    importer.current = {
      state: 'failed',
      finishedAt: NOW,
      message: 'Could not download.',
    };
    const failed = await app.inject({ method: 'GET', url: '/api/compendium/import' });
    expect(failed.json()).toMatchObject({
      state: 'failed',
      message: 'Could not download.',
    });
  });
});

describe('without an importer configured', () => {
  it('says importing is not available, on both routes', async () => {
    const bare = createApp({ worldsRoot, activeWorld, logger: false });
    const get = await bare.inject({ method: 'GET', url: '/api/compendium/import' });
    const postResponse = await bare.inject({
      method: 'POST',
      url: '/api/compendium/import',
      headers: { 'x-device-token': 'gm-token' },
    });
    expect(get.statusCode).toBe(404);
    expect(postResponse.statusCode).toBe(404);
    await bare.close();
  });
});
