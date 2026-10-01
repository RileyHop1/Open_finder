// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDeviceToken } from '../realtime/deviceToken.js';
import { getContentStatus, getImportStatus, startImport } from './contentImport.js';

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

describe('getContentStatus', () => {
  it('reads whether anything is loaded and how many entries', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ available: true, entryCount: 3107, packs: [], skipped: 0 }),
    );
    expect(await getContentStatus()).toEqual({ available: true, entryCount: 3107 });
    expect(fetchMock).toHaveBeenCalledWith('/api/compendium');
  });

  it('throws on a failed response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    await expect(getContentStatus()).rejects.toThrow(/responded 500/);
  });
});

describe('getImportStatus', () => {
  it('parses each state', async () => {
    const states = [
      { state: 'idle' },
      { state: 'running', startedAt: '2026-09-30T00:00:00.000Z' },
      { state: 'done', finishedAt: '2026-09-30T00:03:00.000Z', entryCount: 3107 },
      {
        state: 'failed',
        finishedAt: '2026-09-30T00:03:00.000Z',
        message: 'Could not download.',
        detail: 'ENOTFOUND',
      },
    ];
    for (const state of states) {
      fetchMock.mockResolvedValueOnce(jsonResponse(state));
      expect(await getImportStatus()).toEqual(state);
    }
  });

  it('throws when the server cannot import at all, or sends something unrecognized', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 404));
    await expect(getImportStatus()).rejects.toThrow(/responded 404/);
    fetchMock.mockResolvedValueOnce(jsonResponse({ state: 'mystery' }));
    await expect(getImportStatus()).rejects.toThrow();
  });
});

describe('startImport', () => {
  it('posts with this device’s token and returns the running state', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ state: 'running', startedAt: '2026-09-30T00:00:00.000Z' }, 202),
    );
    expect(await startImport()).toMatchObject({ state: 'running' });
    expect(fetchMock).toHaveBeenCalledWith('/api/compendium/import', {
      method: 'POST',
      headers: { 'x-device-token': getDeviceToken() },
    });
  });

  it('treats “already running” as the state, not an error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ state: 'running', startedAt: '2026-09-30T00:00:00.000Z' }, 409),
    );
    expect(await startImport()).toMatchObject({ state: 'running' });
  });

  it('throws the server’s message when it refuses', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'only the GM can import game content' }, 403),
    );
    await expect(startImport()).rejects.toThrow('only the GM can import game content');
  });
});
