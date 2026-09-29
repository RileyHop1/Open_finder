import type { World } from '@hearthtable/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as worldsApi from '../api/worlds.js';
import { useWorldsStore } from './worlds.js';

vi.mock('../api/worlds.js');

function makeWorld(overrides: Partial<World> = {}): World {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: 'Test Campaign',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
});

describe('refresh', () => {
  it('loads every world and which one is active', async () => {
    const a = makeWorld({ name: 'A' });
    const b = makeWorld({ name: 'B' });
    vi.mocked(worldsApi.listWorlds).mockResolvedValue([a, b]);
    vi.mocked(worldsApi.getActiveWorld).mockResolvedValue(b);

    const store = useWorldsStore();
    await store.refresh();

    expect(store.worlds).toEqual([a, b]);
    expect(store.activeWorldId).toBe(b.id);
    expect(store.loading).toBe(false);
    expect(store.error).toBeUndefined();
  });

  it('leaves activeWorldId undefined when nothing is active', async () => {
    vi.mocked(worldsApi.listWorlds).mockResolvedValue([makeWorld()]);
    vi.mocked(worldsApi.getActiveWorld).mockResolvedValue(undefined);

    const store = useWorldsStore();
    await store.refresh();

    expect(store.activeWorldId).toBeUndefined();
  });

  it('records a readable error and clears loading when the fetch fails', async () => {
    vi.mocked(worldsApi.listWorlds).mockRejectedValue(new Error('network down'));
    vi.mocked(worldsApi.getActiveWorld).mockResolvedValue(undefined);

    const store = useWorldsStore();
    await store.refresh();

    expect(store.error).toBe('network down');
    expect(store.loading).toBe(false);
  });
});

describe('create', () => {
  it('appends the created campaign to the list', async () => {
    const created = makeWorld({ name: 'New Campaign' });
    vi.mocked(worldsApi.createWorld).mockResolvedValue(created);

    const store = useWorldsStore();
    await store.create('New Campaign');

    expect(store.worlds).toEqual([created]);
    expect(worldsApi.createWorld).toHaveBeenCalledWith('New Campaign');
  });

  it('records an error and leaves the list unchanged on failure', async () => {
    vi.mocked(worldsApi.createWorld).mockRejectedValue(new Error('name taken'));

    const store = useWorldsStore();
    await store.create('New Campaign');

    expect(store.worlds).toEqual([]);
    expect(store.error).toBe('name taken');
  });
});

describe('activate', () => {
  it('updates activeWorldId on success', async () => {
    const world = makeWorld();
    vi.mocked(worldsApi.activateWorld).mockResolvedValue(world);

    const store = useWorldsStore();
    await store.activate(world.id);

    expect(store.activeWorldId).toBe(world.id);
  });

  it('records an error and leaves activeWorldId unchanged on failure', async () => {
    vi.mocked(worldsApi.activateWorld).mockRejectedValue(new Error('not found'));

    const store = useWorldsStore();
    await store.activate(crypto.randomUUID());

    expect(store.activeWorldId).toBeUndefined();
    expect(store.error).toBe('not found');
  });
});
