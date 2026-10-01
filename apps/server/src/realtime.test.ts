import { createServer, type Server as HTTPServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BaseDocument, ChatRollMessage, Seat } from '@hearthtable/core';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ActiveWorldManager, createActiveWorldManager } from './activeWorld.js';
import { attachRealtime, type OperationAck, type SyncAck } from './realtime.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let activeWorld: ActiveWorldManager;
let store: WorldStore;
let httpServer: HTTPServer;
let baseUrl: string;
let clients: ClientSocket[];

function connect(deviceToken: string | undefined): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, {
      auth: deviceToken === undefined ? {} : { deviceToken },
      forceNew: true,
      reconnection: false,
    });
    clients.push(socket);
    socket.on('connect', () => {
      resolve(socket);
    });
    socket.on('connect_error', (error: Error) => {
      reject(error);
    });
  });
}

function emitOperation(socket: ClientSocket, operation: unknown): Promise<OperationAck> {
  return new Promise((resolve) => {
    socket.emit('operation', operation, resolve);
  });
}

function emitSync(socket: ClientSocket, lastSequence: number): Promise<SyncAck> {
  return new Promise((resolve) => {
    socket.emit('sync', { lastSequence }, resolve);
  });
}

function waitForBroadcast(
  socket: ClientSocket,
): Promise<{ seats: Seat[]; documents: BaseDocument[] }> {
  return new Promise((resolve) => {
    socket.once('broadcast', resolve);
  });
}

function waitForDisconnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve) => {
    socket.once('disconnect', () => {
      resolve();
    });
  });
}

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-realtime-test-'));
  const created = createWorld(worldsRoot, 'Test Campaign');
  created.close();

  activeWorld = createActiveWorldManager();
  store = activeWorld.set(worldsRoot, created.world.id);

  httpServer = createServer();
  attachRealtime(httpServer, { activeWorld });
  clients = [];

  await new Promise<void>((resolve) => {
    httpServer.listen(0, resolve);
  });
  const address = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  for (const client of clients) {
    client.close();
  }
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
  activeWorld.clear();
  rmSync(worldsRoot, { recursive: true, force: true });
});

describe('connection handshake', () => {
  it('rejects a connection with no deviceToken', async () => {
    await expect(connect(undefined)).rejects.toThrow();
  });

  it('rejects a connection when no world is active', async () => {
    activeWorld.clear();
    await expect(connect('device-a')).rejects.toThrow();
  });

  it('accepts a connection with a deviceToken while a world is active', async () => {
    await expect(connect('device-a')).resolves.toBeDefined();
  });
});

describe('seat.claim', () => {
  it('claims an unclaimed seat and acks ok', async () => {
    const seat = makeSeat();
    store.putSeat(seat);
    const socket = await connect('device-a');

    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: seat.id },
    });

    expect(ack.ok).toBe(true);
    expect(store.getSeat(seat.id)?.claimedByDeviceToken).toBe('device-a');
  });

  it('broadcasts the claimed seat to every connected client', async () => {
    const seat = makeSeat();
    store.putSeat(seat);
    const claimer = await connect('device-a');
    const observer = await connect('device-b');

    const broadcastPromise = waitForBroadcast(observer);
    await emitOperation(claimer, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: seat.id },
    });

    const broadcast = await broadcastPromise;
    expect(broadcast.seats.map((s) => s.id)).toContain(seat.id);
  });

  it('rejects claiming a seat that does not exist', async () => {
    const socket = await connect('device-a');
    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: crypto.randomUUID() },
    });
    expect(ack.ok).toBe(false);
  });

  it('rejects claiming a seat already claimed by a different device', async () => {
    const seat = makeSeat({ claimedByDeviceToken: 'device-a' });
    store.putSeat(seat);
    const socket = await connect('device-b');

    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: seat.id },
    });

    expect(ack.ok).toBe(false);
  });

  it('rejects a wrong pin on a pin-protected seat', async () => {
    const seat = makeSeat({ isGM: true, pin: '1234' });
    store.putSeat(seat);
    const socket = await connect('device-a');

    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: seat.id, pin: '0000' },
    });

    expect(ack.ok).toBe(false);
    expect(store.getSeat(seat.id)?.claimedByDeviceToken).toBeUndefined();
  });

  it('accepts the correct pin on a pin-protected seat', async () => {
    const seat = makeSeat({ isGM: true, pin: '1234' });
    store.putSeat(seat);
    const socket = await connect('device-a');

    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: seat.id, pin: '1234' },
    });

    expect(ack.ok).toBe(true);
  });

  it('auto-releases a previously held seat when claiming a different one', async () => {
    const first = makeSeat({ name: 'First' });
    const second = makeSeat({ name: 'Second' });
    store.putSeat(first);
    store.putSeat(second);
    const socket = await connect('device-a');

    await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: first.id },
    });
    await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: second.id },
    });

    expect(store.getSeat(first.id)?.claimedByDeviceToken).toBeUndefined();
    expect(store.getSeat(second.id)?.claimedByDeviceToken).toBe('device-a');
  });

  it('does not append an operation for a rejected claim', async () => {
    const socket = await connect('device-a');
    await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: crypto.randomUUID() },
    });
    expect(store.listOperationsSince(0)).toEqual([]);
  });
});

describe('seat.release', () => {
  it('releases the seat this connection holds', async () => {
    const seat = makeSeat();
    store.putSeat(seat);
    const socket = await connect('device-a');
    await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: seat.id },
    });

    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.release',
      payload: {},
    });

    expect(ack.ok).toBe(true);
    expect(store.getSeat(seat.id)?.claimedByDeviceToken).toBeUndefined();
  });

  it('rejects releasing when this connection holds no seat', async () => {
    const socket = await connect('device-a');
    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.release',
      payload: {},
    });
    expect(ack.ok).toBe(false);
  });
});

describe('reconnect auto-rejoin', () => {
  it('restores the held seat on a fresh connection with the same device token', async () => {
    const seat = makeSeat();
    store.putSeat(seat);
    const first = await connect('device-a');
    await emitOperation(first, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: seat.id },
    });
    first.close();

    const second = await connect('device-a');
    // seat.release needs no payload target -- it acts on whatever seat this
    // connection holds. If auto-rejoin didn't restore socket.data.seatId,
    // this would be rejected the same way the "holds no seat" test is.
    const ack = await emitOperation(second, {
      id: crypto.randomUUID(),
      type: 'seat.release',
      payload: {},
    });
    expect(ack.ok).toBe(true);
  });
});

describe('sync', () => {
  it('replays operations applied after the given sequence', async () => {
    const seat = makeSeat();
    store.putSeat(seat);
    const socket = await connect('device-a');
    await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: seat.id },
    });

    const result = await emitSync(socket, 0);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]?.type).toBe('seat.claim');
  });

  it('returns nothing new once the caller is already caught up', async () => {
    const seat = makeSeat();
    store.putSeat(seat);
    const socket = await connect('device-a');
    const applied = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: { seatId: seat.id },
    });
    expect(applied.ok).toBe(true);

    const result = await emitSync(socket, store.listOperationsSince(0)[0]?.sequence ?? 0);
    expect(result.operations).toEqual([]);
  });
});

describe('invalid operations', () => {
  it('rejects a payload that does not match any known operation', async () => {
    const socket = await connect('device-a');
    const ack = await emitOperation(socket, { garbage: true });
    expect(ack.ok).toBe(false);
  });
});

async function connectAndClaimSeat(
  deviceToken: string,
): Promise<{ socket: ClientSocket; seatId: string }> {
  const seat = makeSeat();
  store.putSeat(seat);
  const socket = await connect(deviceToken);
  const ack = await emitOperation(socket, {
    id: crypto.randomUUID(),
    type: 'seat.claim',
    payload: { seatId: seat.id },
  });
  if (!ack.ok) {
    throw new Error('test setup failed to claim a seat');
  }
  return { socket, seatId: seat.id };
}

describe('chat.sendMessage', () => {
  it('rejects a connection that has not claimed a seat', async () => {
    const socket = await connect('device-a');
    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'chat.sendMessage',
      payload: { text: 'hello' },
    });
    expect(ack.ok).toBe(false);
  });

  it('stores and broadcasts a text ChatMessage attributed to the sending seat', async () => {
    const { socket: sender, seatId } = await connectAndClaimSeat('device-a');
    const observer = await connect('device-b');
    const broadcastPromise = waitForBroadcast(observer);

    const ack = await emitOperation(sender, {
      id: crypto.randomUUID(),
      type: 'chat.sendMessage',
      payload: { text: 'Rolling for initiative.' },
    });
    expect(ack.ok).toBe(true);

    const broadcast = await broadcastPromise;
    expect(broadcast.documents).toHaveLength(1);
    const [message] = broadcast.documents;
    expect(message).toMatchObject({
      type: 'chatMessage',
      kind: 'text',
      text: 'Rolling for initiative.',
      seatId,
    });
  });

  it('rejects an empty text body', async () => {
    const { socket: sender } = await connectAndClaimSeat('device-a');
    const ack = await emitOperation(sender, {
      id: crypto.randomUUID(),
      type: 'chat.sendMessage',
      payload: { text: '' },
    });
    expect(ack.ok).toBe(false);
  });
});

describe('chat.sendRoll', () => {
  it('rejects a connection that has not claimed a seat', async () => {
    const socket = await connect('device-a');
    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      payload: { expression: '1d20+7' },
    });
    expect(ack.ok).toBe(false);
  });

  it('evaluates the expression server-side and stores/broadcasts a structured RollResult', async () => {
    const { socket: sender } = await connectAndClaimSeat('device-a');
    const observer = await connect('device-b');
    const broadcastPromise = waitForBroadcast(observer);

    const ack = await emitOperation(sender, {
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      payload: { expression: '2d6+4' },
    });
    expect(ack.ok).toBe(true);

    const broadcast = await broadcastPromise;
    expect(broadcast.documents).toHaveLength(1);
    const [message] = broadcast.documents as unknown as [ChatRollMessage];
    expect(message.kind).toBe('roll');
    expect(message.roll.expression).toBe('2d6+4');
    expect(message.roll.total).toBeGreaterThanOrEqual(6);
    expect(message.roll.total).toBeLessThanOrEqual(16);
    expect(message.roll.terms.length).toBeGreaterThan(0);
  });

  it('rejects a malformed expression with the parser error, not a generic one', async () => {
    const { socket: sender } = await connectAndClaimSeat('device-a');
    const ack = await emitOperation(sender, {
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      payload: { expression: 'not a roll' },
    });
    expect(ack.ok).toBe(false);
    expect(ack.error).toMatch(/invalid roll expression/);
  });

  it('rejects an expression referencing an unresolved @reference', async () => {
    const { socket: sender } = await connectAndClaimSeat('device-a');
    const ack = await emitOperation(sender, {
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      payload: { expression: '1d20+@perception' },
    });
    expect(ack.ok).toBe(false);
  });

  it('does not append an operation or store a document for a rejected roll', async () => {
    const { socket: sender } = await connectAndClaimSeat('device-a');
    const before = store.listOperationsSince(0).length;
    await emitOperation(sender, {
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      payload: { expression: 'not a roll' },
    });
    expect(store.listOperationsSince(0)).toHaveLength(before);
    expect(store.listDocuments('chatMessage')).toHaveLength(0);
  });
});

describe('active world changes', () => {
  it('disconnects every connected socket', async () => {
    const other = createWorld(worldsRoot, 'Other Campaign');
    other.close();

    const socket = await connect('device-a');
    const disconnected = waitForDisconnect(socket);

    activeWorld.set(worldsRoot, other.world.id);

    await expect(disconnected).resolves.toBeUndefined();
  });
});

describe('sync -- who is asking', () => {
  it("withholds a non-public operation's payload from a player but not from the GM", async () => {
    const gmSeat = makeSeat({ name: 'GM', isGM: true, claimedByDeviceToken: 'gm-token' });
    const playerSeat = makeSeat({ claimedByDeviceToken: 'player-token' });
    store.putSeat(gmSeat);
    store.putSeat(playerSeat);
    store.appendOperation({
      id: crypto.randomUUID(),
      worldId: store.world.id,
      type: 'actor.update',
      payload: { secret: 1 },
      appliedAt: new Date().toISOString(),
    });

    const player = await connect('player-token');
    const gm = await connect('gm-token');
    const forPlayer = await emitSync(player, 0);
    const forGm = await emitSync(gm, 0);

    expect(forPlayer.operations.map((o) => o.payload)).toEqual([{}]);
    expect(forGm.operations.map((o) => o.payload)).toEqual([{ secret: 1 }]);
    // The operation is still there for the player, so their sequence has no gap.
    expect(forPlayer.operations.map((o) => o.type)).toEqual(['actor.update']);
  });
});
