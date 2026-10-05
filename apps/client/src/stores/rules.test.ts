import type { CompendiumEntry } from '@hearthtable/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../api/compendium.js';
import { useRulesStore } from './rules.js';

vi.mock('../api/compendium.js');

const NOW = '2026-10-04T00:00:00.000Z';

function makeEntry(overrides: Partial<CompendiumEntry> = {}): CompendiumEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'conditions',
    slug: 'frightened',
    name: 'Frightened',
    kind: 'condition',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
});

describe('getEntry', () => {
  it('fetches an entry and returns it', async () => {
    const entry = makeEntry();
    vi.mocked(compendiumApi.getCompendiumEntry).mockResolvedValue(entry);

    const store = useRulesStore();
    expect(await store.getEntry('conditions', 'frightened')).toEqual(entry);
  });

  it('fetches the same (packId, slug) only once, caching the result', async () => {
    const entry = makeEntry();
    vi.mocked(compendiumApi.getCompendiumEntry).mockResolvedValue(entry);

    const store = useRulesStore();
    await store.getEntry('conditions', 'frightened');
    await store.getEntry('conditions', 'frightened');

    expect(compendiumApi.getCompendiumEntry).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    let resolve: (entry: CompendiumEntry | undefined) => void = () => undefined;
    vi.mocked(compendiumApi.getCompendiumEntry).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const store = useRulesStore();
    const first = store.getEntry('conditions', 'frightened');
    const second = store.getEntry('conditions', 'frightened');
    expect(compendiumApi.getCompendiumEntry).toHaveBeenCalledTimes(1);

    const entry = makeEntry();
    resolve(entry);
    expect(await first).toEqual(entry);
    expect(await second).toEqual(entry);
  });

  it('caches a not-found result (undefined) too, without refetching', async () => {
    vi.mocked(compendiumApi.getCompendiumEntry).mockResolvedValue(undefined);

    const store = useRulesStore();
    expect(await store.getEntry('conditions', 'nonexistent')).toBeUndefined();
    expect(await store.getEntry('conditions', 'nonexistent')).toBeUndefined();
    expect(compendiumApi.getCompendiumEntry).toHaveBeenCalledTimes(1);
  });

  it('keeps a separate cache entry per (packId, slug)', async () => {
    const frightened = makeEntry({ slug: 'frightened', name: 'Frightened' });
    const sickened = makeEntry({ slug: 'sickened', name: 'Sickened' });
    vi.mocked(compendiumApi.getCompendiumEntry).mockImplementation((_packId, slug) =>
      Promise.resolve(slug === 'frightened' ? frightened : sickened),
    );

    const store = useRulesStore();
    expect(await store.getEntry('conditions', 'frightened')).toEqual(frightened);
    expect(await store.getEntry('conditions', 'sickened')).toEqual(sickened);
    expect(compendiumApi.getCompendiumEntry).toHaveBeenCalledTimes(2);
  });

  it('does not cache a rejected request, so a later call can retry', async () => {
    vi.mocked(compendiumApi.getCompendiumEntry).mockRejectedValueOnce(
      new Error('network error'),
    );

    const store = useRulesStore();
    await expect(store.getEntry('conditions', 'frightened')).rejects.toThrow(
      'network error',
    );

    const entry = makeEntry();
    vi.mocked(compendiumApi.getCompendiumEntry).mockResolvedValueOnce(entry);
    expect(await store.getEntry('conditions', 'frightened')).toEqual(entry);
    expect(compendiumApi.getCompendiumEntry).toHaveBeenCalledTimes(2);
  });
});
