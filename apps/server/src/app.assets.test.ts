import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ActiveWorldManager, createActiveWorldManager } from './activeWorld.js';
import { createApp } from './app.js';
import { ASSET_NAME_PATTERN, contentTypeOfAsset } from './assets.js';
import { createWorld } from './worldStore.js';

let worldsRoot: string;
let app: FastifyInstance;
let activeWorld: ActiveWorldManager;
let worldId: string;

interface StoredBody {
  name: string;
  hash: string;
  contentType: string;
  size: number;
  url: string;
}

// `response.json()` is `any`; narrowing the parameter makes the assertion real.
function jsonAs<T>(response: { json: () => unknown }): T {
  return response.json() as T;
}

const DEVICE = 'device-a';

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-assets-test-'));
  activeWorld = createActiveWorldManager();
  app = createApp({ worldsRoot, activeWorld, logger: false });
  const store = createWorld(worldsRoot, 'Test Campaign');
  worldId = store.world.id;
  store.putSeat({
    id: crypto.randomUUID(),
    worldId,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    claimedByDeviceToken: DEVICE,
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
  });
  store.close();
});

afterEach(async () => {
  await app.close();
  activeWorld.clear();
  rmSync(worldsRoot, { recursive: true, force: true });
});

/** The signature of a PNG plus filler: enough to be recognised as one, not a drawable image. */
const png = (filler = 'a') =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`invented pixels ${filler}`),
  ]);

const upload = (body: Buffer, contentType = 'image/png', token: string | null = DEVICE) =>
  app.inject({
    method: 'POST',
    url: `/api/worlds/${worldId}/assets`,
    headers: {
      'content-type': contentType,
      ...(token === null ? {} : { 'x-device-token': token }),
    },
    payload: body,
  });

const assetsDir = () => join(worldsRoot, worldId, 'assets');

describe('POST /api/worlds/:id/assets', () => {
  it('stores the file under its content hash and returns where to fetch it', async () => {
    const response = await upload(png());
    expect(response.statusCode).toBe(201);
    const stored = jsonAs<StoredBody>(response);
    expect(stored.name).toMatch(ASSET_NAME_PATTERN);
    expect(stored.name).toBe(`${stored.hash}.png`);
    expect(stored.contentType).toBe('image/png');
    expect(stored.size).toBe(png().length);
    expect(stored.url).toBe(`/api/worlds/${worldId}/assets/${stored.name}`);
    expect(readdirSync(assetsDir())).toEqual([stored.name]);
  });

  it('stores the same bytes once, and different bytes separately', async () => {
    const first = jsonAs<StoredBody>(await upload(png('a')));
    const again = jsonAs<StoredBody>(await upload(png('a')));
    const other = jsonAs<StoredBody>(await upload(png('b')));
    expect(again.name).toBe(first.name);
    expect(other.name).not.toBe(first.name);
    expect(readdirSync(assetsDir()).sort()).toEqual([first.name, other.name].sort());
  });

  it('refuses a caller with no seat, or an unknown device', async () => {
    expect((await upload(png(), 'image/png', null)).statusCode).toBe(403);
    expect((await upload(png(), 'image/png', 'stranger')).statusCode).toBe(403);
    expect(existsSync(assetsDir()) ? readdirSync(assetsDir()) : []).toEqual([]);
  });

  it('refuses a media type that is not an image, and bytes that are not the claimed image', async () => {
    const text = await upload(Buffer.from('hello'), 'text/plain');
    expect(text.statusCode).toBe(400);
    expect(text.json()).toMatchObject({ error: /unsupported media type/ });
    const disguised = await upload(Buffer.from('<script>alert(1)</script>'));
    expect(disguised.statusCode).toBe(400);
    expect(disguised.json()).toMatchObject({ error: /not a valid image/ });
    expect(readdirSync(assetsDir())).toEqual([]);
  });

  it('refuses an empty upload and leaves no temporary file behind', async () => {
    const response = await upload(Buffer.alloc(0));
    expect(response.statusCode).toBe(400);
    expect(readdirSync(assetsDir())).toEqual([]);
  });

  it('404s for an unknown world', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/worlds/${crypto.randomUUID()}/assets`,
      headers: { 'content-type': 'image/png', 'x-device-token': DEVICE },
      payload: png(),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('GET /api/worlds/:id/assets/:name', () => {
  it('serves the stored bytes with the right type, cached and not sniffable', async () => {
    const { name } = jsonAs<StoredBody>(await upload(png()));
    const response = await app.inject({
      method: 'GET',
      url: `/api/worlds/${worldId}/assets/${name}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toContain('immutable');
    expect(response.rawPayload.equals(png())).toBe(true);
  });

  it('404s for a missing asset, a malformed name, and a traversal attempt', async () => {
    const missing = `${'0'.repeat(64)}.png`;
    for (const name of [missing, 'world.db', '..%2Fworld.db', `${'0'.repeat(64)}.svg`]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/worlds/${worldId}/assets/${name}`,
      });
      expect(response.statusCode).toBe(404);
    }
    const badWorld = await app.inject({
      method: 'GET',
      url: `/api/worlds/..%2F${worldId}/assets/${missing}`,
    });
    expect(badWorld.statusCode).toBe(404);
  });
});

describe('contentTypeOfAsset', () => {
  it('maps each extension back to its media type and rejects anything else', () => {
    const hash = 'a'.repeat(64);
    expect(contentTypeOfAsset(`${hash}.jpg`)).toBe('image/jpeg');
    expect(contentTypeOfAsset(`${hash}.webp`)).toBe('image/webp');
    expect(contentTypeOfAsset(`${hash}.gif`)).toBe('image/gif');
    expect(contentTypeOfAsset(`${hash}.exe`)).toBeUndefined();
    expect(contentTypeOfAsset('short.png')).toBeUndefined();
  });
});
