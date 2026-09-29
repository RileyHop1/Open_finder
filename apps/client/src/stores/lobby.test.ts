// @vitest-environment jsdom
import type { Seat } from '@hearthtable/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as seatsApi from '../api/seats.js';
import { getDeviceToken } from '../realtime/deviceToken.js';
import { createSocket, emitOperation } from '../realtime/socket.js';
import { useLobbyStore } from './lobby.js';

vi.mock('../api/seats.js');
vi.mock('../realtime/socket.js');
vi.mock('../realtime/deviceToken.js');

const MY_DEVICE_TOKEN = 'my-device-token';

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

function makeSeat(overrides: Partial<Seat> = {}): Seat {
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

let stubSocket: StubSocket;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(getDeviceToken).mockReturnValue(MY_DEVICE_TOKEN);
  vi.mocked(seatsApi.listSeats).mockResolvedValue([]);
  stubSocket = makeStubSocket();
  vi.mocked(createSocket).mockReturnValue(stubSocket as never);
});

describe('connect', () => {
  it('fetches the current seat list immediately', async () => {
    const worldId = crypto.randomUUID();
    const seat = makeSeat();
    vi.mocked(seatsApi.listSeats).mockResolvedValue([seat]);

    const store = useLobbyStore();
    store.connect(worldId);
    await Promise.resolve();
    await Promise.resolve();

    expect(seatsApi.listSeats).toHaveBeenCalledWith(worldId);
    expect(store.seats).toEqual([seat]);
  });

  it('opens and connects a socket', () => {
    const store = useLobbyStore();
    store.connect(crypto.randomUUID());

    expect(createSocket).toHaveBeenCalledTimes(1);
    expect(stubSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('tears down a previous connection before opening a new one', () => {
    const store = useLobbyStore();
    store.connect(crypto.randomUUID());
    const firstSocket = stubSocket;

    stubSocket = makeStubSocket();
    vi.mocked(createSocket).mockReturnValue(stubSocket as never);
    store.connect(crypto.randomUUID());

    expect(firstSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('sets status to connected and re-fetches seats when the socket connects', async () => {
    const worldId = crypto.randomUUID();
    const store = useLobbyStore();
    store.connect(worldId);
    await Promise.resolve();

    vi.mocked(seatsApi.listSeats).mockClear();
    stubSocket.handlers.get('connect')?.();

    expect(store.status).toBe('connected');
    expect(seatsApi.listSeats).toHaveBeenCalledWith(worldId);
  });

  it('merges a broadcast into the existing seat list by id, not replacing it', async () => {
    const a = makeSeat({ name: 'A' });
    const b = makeSeat({ name: 'B' });
    vi.mocked(seatsApi.listSeats).mockResolvedValue([a, b]);

    const store = useLobbyStore();
    store.connect(crypto.randomUUID());
    await Promise.resolve();
    await Promise.resolve();

    const updatedA = { ...a, claimedByDeviceToken: MY_DEVICE_TOKEN };
    // @ts-expect-error -- broadcast is a partial stub; only `seats` matters here
    stubSocket.handlers.get('broadcast')?.({ seats: [updatedA] });

    expect(store.seats).toEqual([updatedA, b]);
  });

  it('records the connect_error message and sets status to error', () => {
    const store = useLobbyStore();
    store.connect(crypto.randomUUID());

    stubSocket.handlers.get('connect_error')?.(new Error('handshake failed') as never);

    expect(store.status).toBe('error');
    expect(store.error).toBe('handshake failed');
  });
});

describe('mySeat', () => {
  it('is the seat claimed by this device token', async () => {
    const mine = makeSeat({ claimedByDeviceToken: MY_DEVICE_TOKEN });
    const someoneElses = makeSeat({ claimedByDeviceToken: 'someone-else' });
    vi.mocked(seatsApi.listSeats).mockResolvedValue([mine, someoneElses]);

    const store = useLobbyStore();
    store.connect(crypto.randomUUID());
    await Promise.resolve();
    await Promise.resolve();

    expect(store.mySeat?.id).toBe(mine.id);
  });

  it('is undefined when no seat is claimed by this device token', async () => {
    vi.mocked(seatsApi.listSeats).mockResolvedValue([makeSeat()]);

    const store = useLobbyStore();
    store.connect(crypto.randomUUID());
    await Promise.resolve();
    await Promise.resolve();

    expect(store.mySeat).toBeUndefined();
  });
});

describe('claimSeat', () => {
  it('emits a seat.claim operation with the seatId and pin', async () => {
    const store = useLobbyStore();
    store.connect(crypto.randomUUID());
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const seatId = crypto.randomUUID();
    await store.claimSeat(seatId, '1234');

    expect(emitOperation).toHaveBeenCalledWith(
      stubSocket,
      expect.objectContaining({ type: 'seat.claim', payload: { seatId, pin: '1234' } }),
    );
  });

  it('omits pin from the payload when not given', async () => {
    const store = useLobbyStore();
    store.connect(crypto.randomUUID());
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    const seatId = crypto.randomUUID();
    await store.claimSeat(seatId);

    expect(emitOperation).toHaveBeenCalledWith(
      stubSocket,
      expect.objectContaining({ payload: { seatId } }),
    );
  });

  it('records the server-provided error on rejection', async () => {
    const store = useLobbyStore();
    store.connect(crypto.randomUUID());
    vi.mocked(emitOperation).mockResolvedValue({
      ok: false,
      error: 'seat is already claimed',
    });

    await store.claimSeat(crypto.randomUUID());

    expect(store.error).toBe('seat is already claimed');
  });

  it('does nothing when not connected', async () => {
    const store = useLobbyStore();
    await store.claimSeat(crypto.randomUUID());
    expect(emitOperation).not.toHaveBeenCalled();
  });
});

describe('releaseSeat', () => {
  it('emits a seat.release operation with an empty payload', async () => {
    const store = useLobbyStore();
    store.connect(crypto.randomUUID());
    vi.mocked(emitOperation).mockResolvedValue({ ok: true });

    await store.releaseSeat();

    expect(emitOperation).toHaveBeenCalledWith(
      stubSocket,
      expect.objectContaining({ type: 'seat.release', payload: {} }),
    );
  });
});

describe('createSeat', () => {
  it('adds the created seat to the list', async () => {
    const worldId = crypto.randomUUID();
    const created = makeSeat({ worldId, name: 'New Character' });
    vi.mocked(seatsApi.createSeat).mockResolvedValue(created);

    const store = useLobbyStore();
    store.connect(worldId);
    await Promise.resolve();
    await Promise.resolve();

    await store.createSeat('New Character', false);

    expect(seatsApi.createSeat).toHaveBeenCalledWith(
      worldId,
      'New Character',
      false,
      undefined,
    );
    expect(store.seats).toContainEqual(created);
  });
});

describe('disconnect', () => {
  it('disconnects the socket and resets status', () => {
    const store = useLobbyStore();
    store.connect(crypto.randomUUID());

    store.disconnect();

    expect(stubSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(store.status).toBe('disconnected');
  });
});
