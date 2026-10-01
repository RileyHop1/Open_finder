// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDeviceToken } from '../realtime/deviceToken.js';
import { getParty, listActors } from './documents.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const NOW = '2026-09-30T00:00:00.000Z';
const WORLD = crypto.randomUUID();
const envelope = {
  worldId: WORLD,
  schemaVersion: 1,
  permissions: { default: 'observer', seats: {} },
  createdAt: NOW,
  updatedAt: NOW,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listActors', () => {
  it('asks for actors with this device’s token, and validates them', async () => {
    const actor = {
      ...envelope,
      id: crypto.randomUUID(),
      type: 'actor',
      kind: 'character',
      name: 'Hero',
      system: {},
    };
    fetchMock.mockResolvedValue(jsonResponse([actor]));

    expect(await listActors(WORLD)).toEqual([actor]);

    expect(fetchMock).toHaveBeenCalledWith(`/api/worlds/${WORLD}/documents?type=actor`, {
      headers: { 'x-device-token': getDeviceToken() },
    });
  });

  it('throws on a failed response and on a malformed actor', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(listActors(WORLD)).rejects.toThrow(/responded 500/);

    fetchMock.mockResolvedValueOnce(jsonResponse([{ type: 'actor' }]));
    await expect(listActors(WORLD)).rejects.toThrow();
  });
});

describe('getParty', () => {
  it('returns the party, or undefined when there is none', async () => {
    const party = {
      ...envelope,
      id: crypto.randomUUID(),
      type: 'party',
      name: 'Party',
      memberIds: [],
      level: 1,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse([party]));
    expect(await getParty(WORLD)).toEqual(party);

    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    expect(await getParty(WORLD)).toBeUndefined();
  });
});
