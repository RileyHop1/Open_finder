import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activateWorld,
  createWorld,
  deleteWorld,
  getActiveWorld,
  listWorlds,
} from './worlds.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validWorld(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: 'Curse of the Crimson Throne',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listWorlds', () => {
  it('fetches and validates every campaign', async () => {
    const world = validWorld();
    fetchMock.mockResolvedValueOnce(jsonResponse([world]));

    const worlds = await listWorlds();

    expect(fetchMock).toHaveBeenCalledWith('/api/worlds');
    expect(worlds).toEqual([world]);
  });

  it('throws the server’s own error text when it responds with one', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    await expect(listWorlds()).rejects.toThrow('boom');
  });

  it('falls back to the status code when the body has no error text', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(listWorlds()).rejects.toThrow(/500/);
  });

  it('throws when a returned campaign does not match the schema', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'not-a-uuid' }]));
    await expect(listWorlds()).rejects.toThrow();
  });
});

describe('createWorld', () => {
  it('posts the name and returns the created campaign', async () => {
    const world = validWorld({ name: 'A New Hope' });
    fetchMock.mockResolvedValueOnce(jsonResponse(world, 201));

    const created = await createWorld('A New Hope');

    expect(fetchMock).toHaveBeenCalledWith('/api/worlds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A New Hope' }),
    });
    expect(created).toEqual(world);
  });

  it('throws when the server rejects the request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid' }, 400));
    await expect(createWorld('')).rejects.toThrow('invalid');
  });
});

describe('activateWorld', () => {
  it('posts to the activate endpoint and returns the activated campaign', async () => {
    const world = validWorld();
    fetchMock.mockResolvedValueOnce(jsonResponse(world));

    const activated = await activateWorld(world.id);

    expect(fetchMock).toHaveBeenCalledWith(`/api/worlds/${world.id}/activate`, {
      method: 'POST',
    });
    expect(activated).toEqual(world);
  });

  it('throws a readable error when the campaign does not exist', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404));
    await expect(activateWorld(crypto.randomUUID())).rejects.toThrow('not found');
  });
});

describe('getActiveWorld', () => {
  it('returns the active campaign when one exists', async () => {
    const world = validWorld();
    fetchMock.mockResolvedValueOnce(jsonResponse(world));

    expect(await getActiveWorld()).toEqual(world);
  });

  it('returns undefined, not an error, when nothing is active', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'no world is currently active' }, 404),
    );
    expect(await getActiveWorld()).toBeUndefined();
  });

  it('still throws on a genuine server error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    await expect(getActiveWorld()).rejects.toThrow('boom');
  });
});

describe('deleteWorld', () => {
  it('sends a DELETE to the campaign', async () => {
    const id = crypto.randomUUID();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await deleteWorld(id);

    expect(fetchMock).toHaveBeenCalledWith(`/api/worlds/${id}`, { method: 'DELETE' });
  });

  it('throws a readable error when the campaign is active', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'leave the campaign before deleting it' }, 409),
    );
    await expect(deleteWorld(crypto.randomUUID())).rejects.toThrow(
      'leave the campaign before deleting it',
    );
  });
});
