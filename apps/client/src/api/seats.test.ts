import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSeat, listSeats } from './seats.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validSeat(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
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

describe('listSeats', () => {
  it('fetches and validates every seat for a world, pin included', async () => {
    const worldId = crypto.randomUUID();
    const seat = validSeat({ worldId, isGM: true, pin: '4242' });
    fetchMock.mockResolvedValueOnce(jsonResponse([seat]));

    const seats = await listSeats(worldId);

    expect(fetchMock).toHaveBeenCalledWith(`/api/worlds/${worldId}/seats`);
    expect(seats).toEqual([seat]);
  });

  it('throws when the server responds with an error status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    await expect(listSeats(crypto.randomUUID())).rejects.toThrow(/500/);
  });
});

describe('createSeat', () => {
  it('posts name and isGM, omitting pin when not given', async () => {
    const worldId = crypto.randomUUID();
    const seat = validSeat({ worldId, name: 'Valeros' });
    fetchMock.mockResolvedValueOnce(jsonResponse(seat, 201));

    const created = await createSeat(worldId, 'Valeros', false);

    expect(fetchMock).toHaveBeenCalledWith(`/api/worlds/${worldId}/seats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Valeros', isGM: false }),
    });
    expect(created).toEqual(seat);
  });

  it('includes pin in the request body when given', async () => {
    const worldId = crypto.randomUUID();
    const seat = validSeat({ worldId, name: 'GM', isGM: true, pin: '1234' });
    fetchMock.mockResolvedValueOnce(jsonResponse(seat, 201));

    await createSeat(worldId, 'GM', true, '1234');

    expect(fetchMock).toHaveBeenCalledWith(`/api/worlds/${worldId}/seats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'GM', isGM: true, pin: '1234' }),
    });
  });

  it('throws when the server rejects the request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid' }, 400));
    await expect(createSeat(crypto.randomUUID(), '', false)).rejects.toThrow(/400/);
  });
});
