import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BaseDocument } from '@hearthtable/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ActiveWorldManager, createActiveWorldManager } from './activeWorld.js';
import { createApp } from './app.js';
import { openWorld } from './worldStore.js';

let worldsRoot: string;
let app: FastifyInstance;
let activeWorld: ActiveWorldManager;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-app-test-'));
  activeWorld = createActiveWorldManager();
  app = createApp({ worldsRoot, activeWorld, logger: false });
});

afterEach(async () => {
  await app.close();
  activeWorld.clear();
  rmSync(worldsRoot, { recursive: true, force: true });
});

/**
 * `response.json()` is typed `any` (it's from `light-my-request`, which has
 * no way to know a route's response shape). Narrowing the PARAMETER here to
 * `{ json: () => unknown }` means `response.json()` is `unknown` *inside*
 * this function, so `as T` genuinely narrows something and isn't flagged as
 * a no-op assertion the way `any as T` is -- while every call site gets a
 * real, specific type instead of `any` leaking through into unsafe-*
 * lint errors everywhere the result is used.
 */
function jsonAs<T>(response: { json: () => unknown }): T {
  return response.json() as T;
}

interface WorldSummary {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: number;
}

interface SeatSummary {
  readonly id: string;
  readonly worldId: string;
  readonly name: string;
  readonly isGM: boolean;
  readonly pin?: string;
}

async function createTestWorld(): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/worlds',
    payload: { name: 'Test Campaign' },
  });
  return jsonAs<WorldSummary>(response).id;
}

/**
 * Writes a document directly through the store, bypassing HTTP -- there is
 * no REST route for creating a generic document (only the realtime
 * operation handlers do, e.g. `chat.sendMessage`), so this is the only way
 * to set up a fixture for the read-only `GET /api/worlds/:id/documents`
 * route under test here.
 */
function putTestDocument(
  worldId: string,
  overrides: Partial<BaseDocument> = {},
): BaseDocument {
  const now = new Date().toISOString();
  const document: BaseDocument = {
    id: crypto.randomUUID(),
    worldId,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  const store = openWorld(worldsRoot, worldId);
  store.putDocument(document);
  store.close();
  return document;
}

describe('GET /api/worlds', () => {
  it('returns an empty array when no worlds exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/worlds' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('returns every created world', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/worlds',
      payload: { name: 'World A' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/worlds',
      payload: { name: 'World B' },
    });

    const response = await app.inject({ method: 'GET', url: '/api/worlds' });
    const worlds = jsonAs<WorldSummary[]>(response);
    expect(worlds.map((w) => w.name).sort()).toEqual(['World A', 'World B']);
  });
});

describe('POST /api/worlds', () => {
  it('creates a world and returns it with a 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/worlds',
      payload: { name: 'Curse of the Crimson Throne' },
    });
    expect(response.statusCode).toBe(201);
    const world = jsonAs<WorldSummary>(response);
    expect(world.name).toBe('Curse of the Crimson Throne');
    expect(world.schemaVersion).toBe(1);
    expect(typeof world.id).toBe('string');
  });

  it('rejects a missing name with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/worlds',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an empty name with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/worlds',
      payload: { name: '' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('does not activate the created world', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/worlds',
      payload: { name: 'World A' },
    });
    const response = await app.inject({ method: 'GET', url: '/api/worlds/active' });
    expect(response.statusCode).toBe(404);
  });
});

describe('POST /api/worlds/:id/activate', () => {
  it('activates a world that exists', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/worlds',
      payload: { name: 'Test Campaign' },
    });
    const { id } = jsonAs<WorldSummary>(created);

    const response = await app.inject({
      method: 'POST',
      url: `/api/worlds/${id}/activate`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonAs<WorldSummary>(response).id).toBe(id);
  });

  it('returns 404 for a world that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/worlds/${crypto.randomUUID()}/activate`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('switching to a second world deactivates the first', async () => {
    const a = await app.inject({
      method: 'POST',
      url: '/api/worlds',
      payload: { name: 'A' },
    });
    const b = await app.inject({
      method: 'POST',
      url: '/api/worlds',
      payload: { name: 'B' },
    });
    const idA = jsonAs<WorldSummary>(a).id;
    const idB = jsonAs<WorldSummary>(b).id;

    await app.inject({ method: 'POST', url: `/api/worlds/${idA}/activate` });
    await app.inject({ method: 'POST', url: `/api/worlds/${idB}/activate` });

    const active = await app.inject({ method: 'GET', url: '/api/worlds/active' });
    expect(jsonAs<WorldSummary>(active).id).toBe(idB);
  });
});

describe('GET /api/worlds/active', () => {
  it('returns 404 when nothing is active', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/worlds/active' });
    expect(response.statusCode).toBe(404);
  });

  it('returns the active world once one is activated', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/worlds',
      payload: { name: 'Test Campaign' },
    });
    const { id } = jsonAs<WorldSummary>(created);
    await app.inject({ method: 'POST', url: `/api/worlds/${id}/activate` });

    const response = await app.inject({ method: 'GET', url: '/api/worlds/active' });
    expect(response.statusCode).toBe(200);
    expect(jsonAs<WorldSummary>(response).id).toBe(id);
  });
});

describe('static file serving', () => {
  it('serves nothing extra when staticDir is not provided', async () => {
    const response = await app.inject({ method: 'GET', url: '/index.html' });
    expect(response.statusCode).toBe(404);
  });

  it('serves files from staticDir when it is provided and exists', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'hearthtable-static-test-'));
    writeFileSync(join(staticDir, 'index.html'), '<h1>Hearthtable</h1>');

    const staticApp = createApp({
      worldsRoot,
      activeWorld: createActiveWorldManager(),
      staticDir,
      logger: false,
    });
    const response = await staticApp.inject({ method: 'GET', url: '/index.html' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Hearthtable');

    await staticApp.close();
    rmSync(staticDir, { recursive: true, force: true });
  });

  it('does not crash when staticDir is provided but does not exist', () => {
    const missingDir = join(worldsRoot, 'does-not-exist');
    expect(() =>
      createApp({
        worldsRoot,
        activeWorld: createActiveWorldManager(),
        staticDir: missingDir,
        logger: false,
      }),
    ).not.toThrow();
  });
});

describe('POST /api/worlds/:id/seats', () => {
  it('creates a seat and returns it with a 201', async () => {
    const worldId = await createTestWorld();
    const response = await app.inject({
      method: 'POST',
      url: `/api/worlds/${worldId}/seats`,
      payload: { name: 'Valeros', isGM: false },
    });
    expect(response.statusCode).toBe(201);
    const seat = jsonAs<SeatSummary>(response);
    expect(seat.name).toBe('Valeros');
    expect(seat.isGM).toBe(false);
    expect(seat.worldId).toBe(worldId);
  });

  it('creates a GM seat with a pin', async () => {
    const worldId = await createTestWorld();
    const response = await app.inject({
      method: 'POST',
      url: `/api/worlds/${worldId}/seats`,
      payload: { name: 'GM', isGM: true, pin: '4242' },
    });
    expect(response.statusCode).toBe(201);
    expect(jsonAs<SeatSummary>(response).pin).toBe('4242');
  });

  it('rejects a missing isGM with 400 -- there is no default', async () => {
    const worldId = await createTestWorld();
    const response = await app.inject({
      method: 'POST',
      url: `/api/worlds/${worldId}/seats`,
      payload: { name: 'Valeros' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an empty name with 400', async () => {
    const worldId = await createTestWorld();
    const response = await app.inject({
      method: 'POST',
      url: `/api/worlds/${worldId}/seats`,
      payload: { name: '', isGM: false },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 404 for a world that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/worlds/${crypto.randomUUID()}/seats`,
      payload: { name: 'Valeros', isGM: false },
    });
    expect(response.statusCode).toBe(404);
  });

  it('creates a seat on the currently active world without conflict', async () => {
    // Exercises the withWorldStore reuse-the-active-connection path, not
    // just the open-a-fresh-one path the other tests above take.
    const worldId = await createTestWorld();
    await app.inject({ method: 'POST', url: `/api/worlds/${worldId}/activate` });

    const response = await app.inject({
      method: 'POST',
      url: `/api/worlds/${worldId}/seats`,
      payload: { name: 'Valeros', isGM: false },
    });
    expect(response.statusCode).toBe(201);
  });
});

describe('GET /api/worlds/:id/seats', () => {
  it('returns an empty array for a world with no seats', async () => {
    const worldId = await createTestWorld();
    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${worldId}/seats`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('returns every seat created for that world', async () => {
    const worldId = await createTestWorld();
    await app.inject({
      method: 'POST',
      url: `/api/worlds/${worldId}/seats`,
      payload: { name: 'A', isGM: false },
    });
    await app.inject({
      method: 'POST',
      url: `/api/worlds/${worldId}/seats`,
      payload: { name: 'B', isGM: false },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${worldId}/seats`,
    });
    const seats = jsonAs<SeatSummary[]>(response);
    expect(seats.map((s) => s.name).sort()).toEqual(['A', 'B']);
  });

  it("does not return another world's seats", async () => {
    const worldA = await createTestWorld();
    const worldB = await createTestWorld();
    await app.inject({
      method: 'POST',
      url: `/api/worlds/${worldA}/seats`,
      payload: { name: 'A', isGM: false },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${worldB}/seats`,
    });
    expect(jsonAs<SeatSummary[]>(response)).toEqual([]);
  });

  it('returns 404 for a world that does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${crypto.randomUUID()}/seats`,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/worlds/:id/documents', () => {
  it('returns an empty array for a world with no documents', async () => {
    const worldId = await createTestWorld();
    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${worldId}/documents`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('returns every document in the world, oldest first', async () => {
    const worldId = await createTestWorld();
    const older = putTestDocument(worldId, { createdAt: '2024-01-01T00:00:00.000Z' });
    const newer = putTestDocument(worldId, { createdAt: '2024-01-02T00:00:00.000Z' });

    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${worldId}/documents`,
    });
    const documents = jsonAs<BaseDocument[]>(response);
    expect(documents.map((doc) => doc.id)).toEqual([older.id, newer.id]);
  });

  it('filters by type when a ?type= query is given', async () => {
    const worldId = await createTestWorld();
    const chatMessage = putTestDocument(worldId, { type: 'chatMessage' });
    putTestDocument(worldId, { type: 'journalEntry' });

    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${worldId}/documents?type=chatMessage`,
    });
    const documents = jsonAs<BaseDocument[]>(response);
    expect(documents.map((doc) => doc.id)).toEqual([chatMessage.id]);
  });

  it("does not return another world's documents", async () => {
    const worldA = await createTestWorld();
    const worldB = await createTestWorld();
    putTestDocument(worldA);

    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${worldB}/documents`,
    });
    expect(jsonAs<BaseDocument[]>(response)).toEqual([]);
  });

  it('returns 404 for a world that does not exist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${crypto.randomUUID()}/documents`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('reuses the active connection when the requested world is active', async () => {
    const worldId = await createTestWorld();
    await app.inject({ method: 'POST', url: `/api/worlds/${worldId}/activate` });
    putTestDocument(worldId);

    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${worldId}/documents`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonAs<BaseDocument[]>(response)).toHaveLength(1);
  });
});
