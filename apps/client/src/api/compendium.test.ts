import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCompendiumEntry,
  isCompendiumAvailable,
  searchCompendium,
} from './compendium.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isCompendiumAvailable', () => {
  it('reports whether anything was imported', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ available: true, entryCount: 3 }));
    expect(await isCompendiumAvailable()).toBe(true);
    fetchMock.mockResolvedValueOnce(jsonResponse({ available: false, entryCount: 0 }));
    expect(await isCompendiumAvailable()).toBe(false);
  });
});

describe('searchCompendium', () => {
  const summary = {
    packId: 'equipment',
    slug: 'invented-sword',
    name: 'Invented Sword',
    kind: 'weapon',
    traits: ['finesse'],
  };

  it('sends only the parameters that were given', async () => {
    fetchMock.mockImplementation(() => jsonResponse([summary]));

    expect(await searchCompendium()).toEqual([summary]);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/compendium/search');

    await searchCompendium({ q: 'sword', kind: 'weapon', limit: 10 });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/compendium/search?q=sword&kind=weapon&limit=10',
    );

    await searchCompendium({ q: '', kind: '' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/compendium/search');
  });

  it('encodes what the user typed', async () => {
    fetchMock.mockImplementation(() => jsonResponse([]));
    await searchCompendium({ q: 'a&b=c' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/compendium/search?q=a%26b%3Dc');
  });

  it('throws on a failed response and on a malformed body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(searchCompendium()).rejects.toThrow(/responded 500/);
    fetchMock.mockResolvedValueOnce(jsonResponse([{ name: 'no pack' }]));
    await expect(searchCompendium()).rejects.toThrow();
  });
});

describe('getCompendiumEntry', () => {
  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    packId: 'conditions',
    slug: 'frightened',
    name: 'Frightened',
    kind: 'condition',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
    valued: true,
    overrides: [],
  };

  it('fetches the entry at its packId/slug, encoding each', async () => {
    // compendiumEntrySchema only knows the shared envelope -- a kind-specific
    // field like condition's own valued/overrides is stripped, not an error.
    const { valued: _valued, overrides: _overrides, ...baseEntry } = entry;
    fetchMock.mockResolvedValueOnce(jsonResponse(entry));
    expect(await getCompendiumEntry('conditions', 'frightened')).toEqual(baseEntry);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/compendium/conditions/frightened');

    fetchMock.mockResolvedValueOnce(jsonResponse(entry));
    await getCompendiumEntry('a/b', 'c d');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/compendium/a%2Fb/c%20d');
  });

  it('returns undefined on a 404, rather than throwing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404));
    expect(await getCompendiumEntry('conditions', 'nonexistent')).toBeUndefined();
  });

  it('throws on any other failed response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(getCompendiumEntry('conditions', 'frightened')).rejects.toThrow(
      /responded 500/,
    );
  });
});
