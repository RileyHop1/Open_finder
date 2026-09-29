import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listChatMessages } from './chat.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validTextMessage(worldId: string) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: now,
    updatedAt: now,
    seatId: crypto.randomUUID(),
    kind: 'text',
    text: 'Rolling for initiative.',
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

describe('listChatMessages', () => {
  it('fetches chat history filtered by type, and validates it', async () => {
    const worldId = crypto.randomUUID();
    const message = validTextMessage(worldId);
    fetchMock.mockResolvedValueOnce(jsonResponse([message]));

    const messages = await listChatMessages(worldId);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/worlds/${worldId}/documents?type=chatMessage`,
    );
    expect(messages).toEqual([message]);
  });

  it('throws when the server responds with an error status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    await expect(listChatMessages(crypto.randomUUID())).rejects.toThrow(/500/);
  });

  it('throws when a returned document does not match the ChatMessage schema', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ type: 'chatMessage' }]));
    await expect(listChatMessages(crypto.randomUUID())).rejects.toThrow();
  });
});
