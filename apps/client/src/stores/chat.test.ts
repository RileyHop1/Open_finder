// @vitest-environment jsdom
import type { ChatMessage } from '@hearthtable/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import * as chatApi from '../api/chat.js';
import { createSocket, emitOperation } from '../realtime/socket.js';
import { useChatStore } from './chat.js';
import { useConnectionStore } from './connection.js';

// stores/chat.ts reacts to the REAL connectionStore (not mocked), driven
// through the same lower-level socket.js stub the rest of this app's tests
// use -- this exercises the actual optimistic-send-then-reconcile flow
// against a real broadcast round trip, not a hand-simulated shortcut.
vi.mock('../api/chat.js');
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

function makeTextMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: now,
    updatedAt: now,
    seatId: crypto.randomUUID(),
    kind: 'text',
    text: 'hello',
    ...overrides,
  } as ChatMessage;
}

function fakeBroadcast(operationId: string, documents: unknown[]) {
  return {
    sequence: 1,
    operation: {
      id: operationId,
      worldId: 'w',
      type: 'chat.sendMessage',
      payload: {},
      appliedAt: '',
    },
    documents,
    seats: [],
  };
}

let stubSocket: StubSocket;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(chatApi.listChatMessages).mockResolvedValue([]);
  stubSocket = makeStubSocket();
  vi.mocked(createSocket).mockReturnValue(stubSocket as never);
});

describe('load', () => {
  it('loads chat history for the given world', async () => {
    const message = makeTextMessage();
    vi.mocked(chatApi.listChatMessages).mockResolvedValue([message]);

    const store = useChatStore();
    await store.load(crypto.randomUUID());

    expect(store.messages).toEqual([message]);
  });

  it('records a readable error on failure', async () => {
    vi.mocked(chatApi.listChatMessages).mockRejectedValue(new Error('offline'));

    const store = useChatStore();
    await store.load(crypto.randomUUID());

    expect(store.error).toBe('offline');
  });
});

describe('sendMessage', () => {
  it('adds a pending entry immediately, then replaces it once the matching broadcast arrives', async () => {
    const store = useChatStore();
    const connection = useConnectionStore();
    connection.connect();

    let resolveAck: (ack: { ok: boolean }) => void = () => undefined;
    vi.mocked(emitOperation).mockReturnValue(
      new Promise((resolve) => {
        resolveAck = resolve;
      }),
    );

    const sendPromise = store.sendMessage('hello there');
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({
      pending: true,
      kind: 'text',
      text: 'hello there',
    });
    const pendingId = store.messages[0]?.id;
    if (pendingId === undefined) {
      throw new Error('test setup: pending entry has no id');
    }

    resolveAck({ ok: true });
    await sendPromise;

    // The real document arrives over the broadcast, tagged with the same
    // operation id the pending entry used.
    const real = makeTextMessage({ id: pendingId, text: 'hello there' });
    stubSocket.handlers.get('broadcast')?.(fakeBroadcast(pendingId, [real]) as never);
    await nextTick();

    expect(store.messages).toEqual([real]);
  });

  it('removes the pending entry and records the error on rejection', async () => {
    const store = useChatStore();
    const connection = useConnectionStore();
    connection.connect();
    vi.mocked(emitOperation).mockResolvedValue({ ok: false, error: 'not connected' });

    await store.sendMessage('hello');

    expect(store.messages).toEqual([]);
    expect(store.error).toBe('not connected');
  });

  it('sends a chat.sendMessage operation with the text payload', async () => {
    const store = useChatStore();
    const connection = useConnectionStore();
    connection.connect();
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    await store.sendMessage('hello');

    expect(emitOperation).toHaveBeenCalledWith(
      stubSocket,
      expect.objectContaining({ type: 'chat.sendMessage', payload: { text: 'hello' } }),
    );
  });
});

describe('sendRoll', () => {
  it('adds a pending roll entry with the expression, not a guessed result', () => {
    const store = useChatStore();
    const connection = useConnectionStore();
    connection.connect();
    vi.mocked(emitOperation).mockReturnValue(new Promise(() => undefined));

    void store.sendRoll('1d20+7');

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({
      pending: true,
      kind: 'roll',
      expression: '1d20+7',
    });
  });

  it('sends a chat.sendRoll operation with the expression payload', async () => {
    const store = useChatStore();
    const connection = useConnectionStore();
    connection.connect();
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    await store.sendRoll('1d20+7');

    expect(emitOperation).toHaveBeenCalledWith(
      stubSocket,
      expect.objectContaining({
        type: 'chat.sendRoll',
        payload: { expression: '1d20+7' },
      }),
    );
  });

  it('removes the pending roll and records the error on rejection', async () => {
    const store = useChatStore();
    const connection = useConnectionStore();
    connection.connect();
    vi.mocked(emitOperation).mockResolvedValue({
      ok: false,
      error: 'invalid roll expression',
    });

    await store.sendRoll('not a roll');

    expect(store.messages).toEqual([]);
    expect(store.error).toBe('invalid roll expression');
  });
});

describe('broadcast handling', () => {
  it('ignores documents that are not valid ChatMessages', async () => {
    const store = useChatStore();
    const connection = useConnectionStore();
    connection.connect();

    stubSocket.handlers.get('broadcast')?.(
      fakeBroadcast(crypto.randomUUID(), [{ type: 'journalEntry' }]) as never,
    );
    await nextTick();

    expect(store.messages).toEqual([]);
  });

  it('appends a message from another connection without touching unrelated pending entries', async () => {
    const store = useChatStore();
    const connection = useConnectionStore();
    connection.connect();
    vi.mocked(emitOperation).mockReturnValue(new Promise(() => undefined));

    void store.sendMessage('mine, still pending');
    const mine = store.messages[0];

    const theirs = makeTextMessage({ text: 'someone else said this' });
    stubSocket.handlers.get('broadcast')?.(
      fakeBroadcast(crypto.randomUUID(), [theirs]) as never,
    );
    await nextTick();

    expect(store.messages).toEqual([mine, theirs]);
  });
});
