// @vitest-environment jsdom
import type { Actor, BaseDocument, Party } from '@hearthtable/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import * as documentsApi from '../api/documents.js';
import { createSocket, emitOperation } from '../realtime/socket.js';
import { useConnectionStore } from './connection.js';
import { useDocumentsStore } from './documents.js';

// Like stores/chat.test.ts: the REAL connection store, driven through the
// socket.js stub, so a broadcast takes the same path it does in the app.
vi.mock('../api/documents.js');
vi.mock('../realtime/socket.js');

interface StubSocket {
  on: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  handlers: Map<string, (...args: never[]) => void>;
}

function makeStubSocket(): StubSocket {
  const handlers = new Map<string, (...args: never[]) => void>();
  return {
    handlers,
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      handlers.set(event, handler);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

const NOW = '2026-09-30T00:00:00.000Z';
const WORLD = crypto.randomUUID();

function makeActor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: crypto.randomUUID(),
    worldId: WORLD,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name: 'Hero',
    system: { level: 1, attributes: { str: 0 } },
    ...overrides,
  };
}

function makeParty(memberIds: string[]): Party {
  return {
    id: crypto.randomUUID(),
    worldId: WORLD,
    type: 'party',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    name: 'Party',
    memberIds,
    level: 1,
  };
}

function tombstone(document: BaseDocument): BaseDocument {
  const { id, worldId, type, schemaVersion, permissions, createdAt, updatedAt } =
    document;
  return { id, worldId, type, schemaVersion, permissions, createdAt, updatedAt };
}

function fakeBroadcast(
  operationId: string,
  documents: unknown[],
  deleted: BaseDocument[] = [],
) {
  return {
    sequence: 1,
    operation: { id: operationId, worldId: 'w', type: 'x', payload: {}, appliedAt: '' },
    documents,
    deleted,
    seats: [],
  };
}

let stubSocket: StubSocket;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(documentsApi.listActors).mockResolvedValue([]);
  vi.mocked(documentsApi.getParty).mockResolvedValue(undefined);
  stubSocket = makeStubSocket();
  vi.mocked(createSocket).mockReturnValue(stubSocket as never);
});

function broadcast(
  operationId: string,
  documents: unknown[],
  deleted: BaseDocument[] = [],
) {
  stubSocket.handlers.get('broadcast')?.(
    fakeBroadcast(operationId, documents, deleted) as never,
  );
}

describe('load', () => {
  it('loads the actors and the party', async () => {
    const hero = makeActor();
    const party = makeParty([hero.id]);
    vi.mocked(documentsApi.listActors).mockResolvedValue([hero]);
    vi.mocked(documentsApi.getParty).mockResolvedValue(party);

    const store = useDocumentsStore();
    await store.load(WORLD);

    expect(store.actors).toEqual([hero]);
    expect(store.party).toEqual(party);
    expect(store.members).toEqual([hero]);
  });

  it('records a readable error on failure', async () => {
    vi.mocked(documentsApi.listActors).mockRejectedValue(new Error('offline'));
    const store = useDocumentsStore();
    await store.load(WORLD);
    expect(store.error).toBe('offline');
  });
});

describe('broadcasts', () => {
  it('adds a new actor and replaces a changed one in place', async () => {
    const first = makeActor({ name: 'First' });
    vi.mocked(documentsApi.listActors).mockResolvedValue([first]);
    const store = useDocumentsStore();
    useConnectionStore().connect();
    await store.load(WORLD);

    const second = makeActor({ name: 'Second' });
    broadcast(crypto.randomUUID(), [second]);
    await nextTick();
    expect(store.actors.map((a) => a.name)).toEqual(['First', 'Second']);

    broadcast(crypto.randomUUID(), [{ ...first, name: 'Renamed' }]);
    await nextTick();
    expect(store.actors.map((a) => a.name)).toEqual(['Renamed', 'Second']);
  });

  it('removes a deleted actor, and the party it belonged to if that was deleted', async () => {
    const hero = makeActor();
    const party = makeParty([hero.id]);
    vi.mocked(documentsApi.listActors).mockResolvedValue([hero]);
    vi.mocked(documentsApi.getParty).mockResolvedValue(party);
    const store = useDocumentsStore();
    useConnectionStore().connect();
    await store.load(WORLD);

    broadcast(crypto.randomUUID(), [{ ...party, memberIds: [] }], [tombstone(hero)]);
    await nextTick();
    expect(store.actors).toEqual([]);
    expect(store.party?.memberIds).toEqual([]);

    broadcast(crypto.randomUUID(), [], [tombstone(party)]);
    await nextTick();
    expect(store.party).toBeUndefined();
  });

  it('shows a party created by a broadcast, with members in party order', async () => {
    const [a, b] = [makeActor({ name: 'A' }), makeActor({ name: 'B' })];
    vi.mocked(documentsApi.listActors).mockResolvedValue([a, b]);
    const store = useDocumentsStore();
    useConnectionStore().connect();
    await store.load(WORLD);

    broadcast(crypto.randomUUID(), [makeParty([b.id, a.id])]);
    await nextTick();
    expect(store.members.map((m) => m.name)).toEqual(['B', 'A']);
  });

  it('ignores documents it does not model', async () => {
    const store = useDocumentsStore();
    useConnectionStore().connect();
    await store.load(WORLD);
    broadcast(crypto.randomUUID(), [{ type: 'chatMessage', id: crypto.randomUUID() }]);
    await nextTick();
    expect(store.actors).toEqual([]);
    expect(store.party).toBeUndefined();
  });
});

describe('updateActor', () => {
  async function loadedHero() {
    const hero = makeActor();
    vi.mocked(documentsApi.listActors).mockResolvedValue([hero]);
    const store = useDocumentsStore();
    useConnectionStore().connect();
    await store.load(WORLD);
    return { store, hero };
  }

  it('shows the edit at once, and keeps it when the confirming broadcast arrives', async () => {
    const { store, hero } = await loadedHero();
    let resolveAck: (ack: { ok: boolean }) => void = () => undefined;
    vi.mocked(emitOperation).mockReturnValue(
      new Promise((resolve) => {
        resolveAck = resolve;
      }),
    );

    const done = store.updateActor(hero.id, { name: 'Valeria', 'system.level': 2 });
    expect(store.actors[0]).toMatchObject({ name: 'Valeria', system: { level: 2 } });
    // Fields the edit did not touch are untouched.
    expect(store.actors[0]?.system).toMatchObject({ attributes: { str: 0 } });

    resolveAck({ ok: true });
    await done;

    const operationId = vi.mocked(emitOperation).mock.calls[0]?.[1].id ?? '';
    broadcast(operationId, [
      { ...hero, name: 'Valeria', system: { ...hero.system, level: 2 } },
    ]);
    await nextTick();
    expect(store.actors[0]).toMatchObject({ name: 'Valeria', system: { level: 2 } });
  });

  it('rolls back to the confirmed state, with the error, when the server rejects it', async () => {
    const { store, hero } = await loadedHero();
    vi.mocked(emitOperation).mockResolvedValue({
      ok: false,
      error: 'invalid change: system.level: too big',
    });

    const accepted = await store.updateActor(hero.id, { 'system.level': 99 });

    expect(accepted).toBe(false);
    expect(store.actors[0]).toEqual(hero);
    expect(store.error).toBe('invalid change: system.level: too big');
  });

  it('keeps another seat’s change to a different field while this edit is pending', async () => {
    const { store, hero } = await loadedHero();
    vi.mocked(emitOperation).mockReturnValue(new Promise(() => undefined));

    void store.updateActor(hero.id, { name: 'Mine' });
    // Someone else changes the level; their confirmed document arrives first.
    broadcast(crypto.randomUUID(), [{ ...hero, system: { ...hero.system, level: 3 } }]);
    await nextTick();

    expect(store.actors[0]).toMatchObject({ name: 'Mine', system: { level: 3 } });
  });

  it('drops a pending edit for an actor that was deleted', async () => {
    const { store, hero } = await loadedHero();
    vi.mocked(emitOperation).mockReturnValue(new Promise(() => undefined));
    void store.updateActor(hero.id, { name: 'Mine' });

    broadcast(crypto.randomUUID(), [], [tombstone(hero)]);
    await nextTick();
    expect(store.actors).toEqual([]);
  });
});

describe('send', () => {
  it('reports acceptance and records a rejection', async () => {
    const store = useDocumentsStore();
    useConnectionStore().connect();

    vi.mocked(emitOperation).mockResolvedValueOnce({ ok: true });
    expect(await store.send('actor.addItem', {})).toBe(true);
    expect(store.error).toBeUndefined();

    vi.mocked(emitOperation).mockResolvedValueOnce({ ok: false, error: 'nope' });
    expect(await store.send('actor.addItem', {})).toBe(false);
    expect(store.error).toBe('nope');
  });
});

describe('reconnecting', () => {
  it('reloads, so a broadcast missed while offline cannot leave the view stale', async () => {
    const store = useDocumentsStore();
    useConnectionStore().connect();
    await store.load(WORLD);
    expect(documentsApi.listActors).toHaveBeenCalledTimes(1);

    stubSocket.handlers.get('connect')?.();
    await nextTick();
    expect(documentsApi.listActors).toHaveBeenCalledTimes(2);
  });
});
