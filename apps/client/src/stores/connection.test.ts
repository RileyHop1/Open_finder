// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSocket, emitOperation } from '../realtime/socket.js';
import { useConnectionStore } from './connection.js';

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

let stubSocket: StubSocket;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  stubSocket = makeStubSocket();
  vi.mocked(createSocket).mockReturnValue(stubSocket as never);
});

describe('connect', () => {
  it('opens and connects a socket, status starts at connecting', () => {
    const store = useConnectionStore();
    store.connect();

    expect(createSocket).toHaveBeenCalledTimes(1);
    expect(stubSocket.connect).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('connecting');
  });

  it('tears down a previous connection before opening a new one', () => {
    const store = useConnectionStore();
    store.connect();
    const firstSocket = stubSocket;

    stubSocket = makeStubSocket();
    vi.mocked(createSocket).mockReturnValue(stubSocket as never);
    store.connect();

    expect(firstSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('sets status to connected when the socket connects', () => {
    const store = useConnectionStore();
    store.connect();
    stubSocket.handlers.get('connect')?.();
    expect(store.status).toBe('connected');
  });

  it('sets status to disconnected when the socket disconnects', () => {
    const store = useConnectionStore();
    store.connect();
    stubSocket.handlers.get('connect')?.();
    stubSocket.handlers.get('disconnect')?.();
    expect(store.status).toBe('disconnected');
  });

  it('records the connect_error message and sets status to error', () => {
    const store = useConnectionStore();
    store.connect();
    stubSocket.handlers.get('connect_error')?.(new Error('handshake failed') as never);

    expect(store.status).toBe('error');
    expect(store.error).toBe('handshake failed');
  });

  it('stores every broadcast as lastBroadcast', () => {
    const store = useConnectionStore();
    store.connect();
    const broadcast = { sequence: 1, seats: [], documents: [] };
    stubSocket.handlers.get('broadcast')?.(broadcast as never);
    expect(store.lastBroadcast).toEqual(broadcast);
  });
});

describe('disconnect', () => {
  it('disconnects the socket, resets status, and clears lastBroadcast', () => {
    const store = useConnectionStore();
    store.connect();
    stubSocket.handlers.get('broadcast')?.({ sequence: 1 } as never);

    store.disconnect();

    expect(stubSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('disconnected');
    expect(store.lastBroadcast).toBeUndefined();
  });
});

describe('sendOperation', () => {
  it('emits the operation with the given id, type, and payload, and returns the ack', async () => {
    const store = useConnectionStore();
    store.connect();
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const result = await store.sendOperation('op-1', 'chat.sendMessage', { text: 'hi' });

    expect(emitOperation).toHaveBeenCalledWith(stubSocket, {
      id: 'op-1',
      type: 'chat.sendMessage',
      payload: { text: 'hi' },
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns a "not connected" ack without emitting when there is no socket', async () => {
    const store = useConnectionStore();
    const result = await store.sendOperation('op-1', 'chat.sendMessage', { text: 'hi' });

    expect(emitOperation).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: 'not connected' });
  });
});
