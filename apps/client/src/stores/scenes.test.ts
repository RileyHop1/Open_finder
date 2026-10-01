// @vitest-environment jsdom
import type { BaseDocument, Party, Scene, Token } from '@hearthtable/core';
import { partySchema, sceneSchema, tokenSchema } from '@hearthtable/core';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import * as documentsApi from '../api/documents.js';
import { createSocket, emitOperation } from '../realtime/socket.js';
import { useConnectionStore } from './connection.js';
import { useDocumentsStore } from './documents.js';
import { DRAG_PREVIEW_TTL_MS, useScenesStore } from './scenes.js';

// The REAL connection store, driven through the socket.js stub, so a broadcast
// or a drag event takes the same path it does in the app.
vi.mock('../api/documents.js');
vi.mock('../realtime/socket.js');

type Handler = (...args: never[]) => void;

const NOW = '2026-10-01T00:00:00.000Z';
const WORLD = crypto.randomUUID();

const base = (type: string) => ({
  id: crypto.randomUUID(),
  worldId: WORLD,
  type,
  schemaVersion: 1,
  permissions: { default: 'observer', seats: {} },
  createdAt: NOW,
  updatedAt: NOW,
});

const makeScene = (name: string): Scene =>
  sceneSchema.parse({ ...base('scene'), name, kind: 'battle' });

const makeToken = (sceneId: string): Token =>
  tokenSchema.parse({
    ...base('token'),
    sceneId,
    actorId: crypto.randomUUID(),
    x: 150,
    y: 250,
  });

const makeParty = (sceneId?: string): Party =>
  partySchema.parse({
    ...base('party'),
    name: 'Party',
    memberIds: [],
    level: 1,
    ...(sceneId === undefined ? {} : { sceneId }),
  });

const tombstone = (document: BaseDocument): BaseDocument => ({
  id: document.id,
  worldId: document.worldId,
  type: document.type,
  schemaVersion: document.schemaVersion,
  permissions: document.permissions,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
});

let handlers: Map<string, Handler>;
let emit: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  handlers = new Map();
  emit = vi.fn();
  vi.mocked(createSocket).mockReturnValue({
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit,
  } as never);
  vi.mocked(documentsApi.listActors).mockResolvedValue([]);
  vi.mocked(documentsApi.getParty).mockResolvedValue(undefined);
  vi.mocked(documentsApi.listScenes).mockResolvedValue([]);
  vi.mocked(documentsApi.listTokens).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function broadcast(
  operationId: string,
  documents: unknown[],
  deleted: BaseDocument[] = [],
): Promise<void> {
  handlers.get('broadcast')?.({
    sequence: 1,
    operation: { id: operationId, worldId: 'w', type: 'x', payload: {}, appliedAt: '' },
    documents,
    deleted,
    seats: [],
  } as never);
  await nextTick();
}

/** A table with the party on the Bog, two scenes, and a token on each. */
async function table() {
  const [bog, keep] = [makeScene('Bog'), makeScene('Keep')];
  const [onBog, onKeep] = [makeToken(bog.id), makeToken(keep.id)];
  vi.mocked(documentsApi.getParty).mockResolvedValue(makeParty(bog.id));
  vi.mocked(documentsApi.listScenes).mockResolvedValue([bog, keep]);
  vi.mocked(documentsApi.listTokens).mockResolvedValue([onBog, onKeep]);

  const connection = useConnectionStore();
  connection.connect();
  const documents = useDocumentsStore();
  const store = useScenesStore();
  await documents.load(WORLD);
  await store.load(WORLD);
  return { store, documents, connection, bog, keep, onBog, onKeep };
}

describe('load and the shown scene', () => {
  it('shows the party’s scene and only its tokens', async () => {
    const { store, bog, onBog } = await table();
    expect(store.partySceneId).toBe(bog.id);
    expect(store.shownScene).toEqual(bog);
    expect(store.shownTokens).toEqual([onBog]);
    expect(store.isPreviewing).toBe(false);
  });

  it('shows nothing when the GM has not moved the party anywhere', async () => {
    const connection = useConnectionStore();
    connection.connect();
    const store = useScenesStore();
    await store.load(WORLD);
    expect(store.shownScene).toBeUndefined();
    expect(store.shownTokens).toEqual([]);
  });

  it('lets the GM preview another scene locally, and return to the party’s', async () => {
    const { store, keep, onKeep, bog } = await table();
    store.previewScene(keep.id);
    expect(store.shownScene).toEqual(keep);
    expect(store.shownTokens).toEqual([onKeep]);
    expect(store.isPreviewing).toBe(true);
    expect(store.partySceneId).toBe(bog.id);

    store.previewScene(undefined);
    expect(store.shownSceneId).toBe(bog.id);
    expect(store.isPreviewing).toBe(false);
  });

  it('follows the party when the GM moves it, and falls back if a previewed scene is deleted', async () => {
    const { store, documents, keep, bog } = await table();
    await broadcast('op-activate', [{ ...documents.party, sceneId: keep.id }]);
    await nextTick();
    expect(store.shownSceneId).toBe(keep.id);

    store.previewScene(bog.id);
    expect(store.shownSceneId).toBe(bog.id);
    await broadcast('op-del', [], [tombstone(bog)]);
    expect(store.shownSceneId).toBe(keep.id);
  });

  it('records a readable error on failure', async () => {
    vi.mocked(documentsApi.listScenes).mockRejectedValue(new Error('offline'));
    const store = useScenesStore();
    await store.load(WORLD);
    expect(store.error).toBe('offline');
  });

  it('loads again after a reconnect', async () => {
    const { connection } = await table();
    vi.mocked(documentsApi.listScenes).mockClear();
    handlers.get('disconnect')?.();
    handlers.get('connect')?.();
    await nextTick();
    expect(connection.status).toBe('connected');
    expect(documentsApi.listScenes).toHaveBeenCalledWith(WORLD);
  });
});

describe('broadcasts', () => {
  it('adds and updates scenes and tokens, and ignores other documents', async () => {
    const { store, bog, onBog } = await table();
    const renamed = { ...bog, name: 'Deep Bog' };
    const fresh = makeToken(bog.id);
    await broadcast('op-1', [renamed, fresh, base('chatMessage')]);
    expect(store.scenes.find((s) => s.id === bog.id)?.name).toBe('Deep Bog');
    expect(store.shownTokens.map((t) => t.id)).toEqual([onBog.id, fresh.id]);
  });

  it('removes a deleted scene and token', async () => {
    const { store, onBog, bog } = await table();
    await broadcast('op-del', [], [tombstone(onBog)]);
    expect(store.shownTokens).toEqual([]);
    await broadcast('op-del2', [], [tombstone(bog)]);
    expect(store.scenes.map((s) => s.name)).toEqual(['Keep']);
  });
});

describe('moveToken', () => {
  it('shows the move at once, and keeps it when the server confirms', async () => {
    const { store, onBog } = await table();
    let release: (ack: { ok: true }) => void = () => undefined;
    vi.mocked(emitOperation).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const done = store.moveToken(onBog.id, 400, 500);
    expect(store.shownTokens[0]).toMatchObject({ x: 400, y: 500 });
    expect(emitOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'token.move',
        payload: { tokenId: onBog.id, x: 400, y: 500 },
      }),
    );

    const sent = vi.mocked(emitOperation).mock.calls[0]?.[1];
    await broadcast(sent?.id ?? '', [{ ...onBog, x: 400, y: 500 }]);
    release({ ok: true });
    expect(await done).toBe(true);
    expect(store.shownTokens[0]).toMatchObject({ x: 400, y: 500 });
  });

  it('puts the token back, with the reason, when the server refuses', async () => {
    const { store, onBog } = await table();
    vi.mocked(emitOperation).mockResolvedValue({ ok: false, error: 'not yours' });

    expect(await store.moveToken(onBog.id, 400, 500)).toBe(false);
    expect(store.shownTokens[0]).toMatchObject({ x: 150, y: 250 });
    expect(store.error).toBe('not yours');
  });
});

describe('drag previews from other seats', () => {
  const drag = (tokenId: string, x: number, y: number) =>
    handlers.get('token.drag')?.({ tokenId, x, y } as never);

  it('shows the token where it is being dragged, until the settled move arrives', async () => {
    const { store, onBog } = await table();
    drag(onBog.id, 300, 310);
    expect(store.shownTokens[0]).toMatchObject({ x: 300, y: 310 });
    drag(onBog.id, 320, 330);
    expect(store.shownTokens[0]).toMatchObject({ x: 320, y: 330 });

    await broadcast('op-move', [{ ...onBog, x: 350, y: 350 }]);
    expect(store.shownTokens[0]).toMatchObject({ x: 350, y: 350 });
  });

  it('drops a preview that goes quiet, so a lost connection leaves no ghost', async () => {
    vi.useFakeTimers();
    const { store, onBog } = await table();
    drag(onBog.id, 300, 310);
    vi.advanceTimersByTime(DRAG_PREVIEW_TTL_MS - 1);
    expect(store.shownTokens[0]).toMatchObject({ x: 300 });
    vi.advanceTimersByTime(2);
    expect(store.shownTokens[0]).toMatchObject({ x: 150, y: 250 });
  });

  it('lets a newer preview extend the wait', async () => {
    vi.useFakeTimers();
    const { store, onBog } = await table();
    drag(onBog.id, 300, 310);
    vi.advanceTimersByTime(DRAG_PREVIEW_TTL_MS - 100);
    drag(onBog.id, 301, 311);
    vi.advanceTimersByTime(DRAG_PREVIEW_TTL_MS - 100);
    expect(store.shownTokens[0]).toMatchObject({ x: 301 });
  });

  it('ignores a preview of a token it does not know, and forgets one when its token is deleted', async () => {
    const { store, onBog } = await table();
    drag(crypto.randomUUID(), 1, 1);
    expect(store.tokens).toHaveLength(2);

    drag(onBog.id, 300, 310);
    await broadcast('op-del', [], [tombstone(onBog)]);
    await broadcast('op-readd', [onBog]);
    expect(store.shownTokens[0]).toMatchObject({ x: 150, y: 250 });
  });

  it('sends this seat’s own preview as a plain event', async () => {
    const { store, onBog } = await table();
    store.sendDrag(onBog.id, 10, 20);
    expect(emit).toHaveBeenCalledWith('token.drag', { tokenId: onBog.id, x: 10, y: 20 });
  });
});

describe('this seat’s own drag', () => {
  it('shows the token where the pointer holds it, above a pending move, until let go', async () => {
    const { store, onBog } = await table();
    vi.mocked(emitOperation).mockReturnValue(new Promise(() => undefined));
    void store.moveToken(onBog.id, 400, 500);
    expect(store.shownTokens[0]).toMatchObject({ x: 400, y: 500 });

    store.setLocalDrag(onBog.id, 600, 610);
    expect(store.shownTokens[0]).toMatchObject({ x: 600, y: 610 });
    store.setLocalDrag(onBog.id, 650, 660);
    expect(store.shownTokens[0]).toMatchObject({ x: 650, y: 660 });

    store.clearLocalDrag(onBog.id);
    expect(store.shownTokens[0]).toMatchObject({ x: 400, y: 500 });
  });

  it('hands over to the move with no flicker, and snaps back if it is refused', async () => {
    const { store, onBog } = await table();
    vi.mocked(emitOperation).mockResolvedValue({ ok: false, error: 'no' });
    store.setLocalDrag(onBog.id, 300, 300);
    const done = store.moveToken(onBog.id, 300, 300);
    store.clearLocalDrag(onBog.id);
    expect(store.shownTokens[0]).toMatchObject({ x: 300, y: 300 });

    await done;
    expect(store.shownTokens[0]).toMatchObject({ x: 150, y: 250 });
  });

  it('is not disturbed by another seat’s preview of the same token', async () => {
    const { store, onBog } = await table();
    store.setLocalDrag(onBog.id, 600, 610);
    handlers.get('token.drag')?.({ tokenId: onBog.id, x: 1, y: 2 } as never);
    expect(store.shownTokens[0]).toMatchObject({ x: 600, y: 610 });
  });

  it('clearing a token that is not held does nothing', async () => {
    const { store } = await table();
    expect(() => store.clearLocalDrag(crypto.randomUUID())).not.toThrow();
  });
});

describe('placeToken', () => {
  it('asks for a token on the shown scene, at the point given', async () => {
    const { store, bog } = await table();
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const actorId = crypto.randomUUID();

    expect(await store.placeToken(actorId, { x: 300, y: 400 })).toBe(true);
    expect(emitOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'token.create',
        payload: { sceneId: bog.id, actorId, at: { x: 300, y: 400 } },
      }),
    );
  });

  it('leaves the place to the server when none is given', async () => {
    const { store, bog } = await table();
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    const actorId = crypto.randomUUID();
    await store.placeToken(actorId);
    const sent = vi.mocked(emitOperation).mock.calls[0]?.[1];
    expect(sent?.payload).toEqual({ sceneId: bog.id, actorId });
  });

  it('places on the scene being previewed, not the party’s', async () => {
    const { store, keep } = await table();
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });
    store.previewScene(keep.id);
    await store.placeToken(crypto.randomUUID());
    const sent = vi.mocked(emitOperation).mock.calls[0]?.[1];
    expect(sent?.payload).toMatchObject({ sceneId: keep.id });
  });

  it('does nothing with no scene shown, and says nothing was placed', async () => {
    setActivePinia(createPinia());
    const store = useScenesStore();
    expect(await store.placeToken(crypto.randomUUID())).toBe(false);
    expect(emitOperation).not.toHaveBeenCalled();
  });

  it('records a refusal', async () => {
    const { store } = await table();
    vi.mocked(emitOperation).mockResolvedValue({ ok: false, error: 'GM only' });
    expect(await store.placeToken(crypto.randomUUID())).toBe(false);
    expect(store.error).toBe('GM only');
  });
});

describe('send', () => {
  it('records a refusal, and clears it on the next try', async () => {
    const { store } = await table();
    vi.mocked(emitOperation).mockResolvedValueOnce({ ok: false, error: 'nope' });
    expect(await store.send('scene.activate', {})).toBe(false);
    expect(store.error).toBe('nope');
    vi.mocked(emitOperation).mockResolvedValueOnce({ ok: true });
    expect(await store.send('scene.activate', {})).toBe(true);
    expect(store.error).toBeUndefined();
  });
});
