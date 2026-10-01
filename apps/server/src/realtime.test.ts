import { createServer, type Server as HTTPServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BaseDocument, Broadcast, ChatRollMessage, Seat } from '@hearthtable/core';
import { chatCheckMessageSchema } from '@hearthtable/core';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ActiveWorldManager, createActiveWorldManager } from './activeWorld.js';
import type { CompendiumIndex } from './compendium.js';
import { attachRealtime, type OperationAck, type SyncAck } from './realtime.js';
import { createWorld, type WorldStore } from './worldStore.js';

const ROPE = {
  id: '30000000-0001-5000-8000-000000000001',
  schemaVersion: 1,
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
  packId: 'equipment',
  slug: 'rope',
  name: 'Rope',
  kind: 'gear' as const,
  provenance: {
    publication: 'Pathfinder Player Core',
    license: 'ORC' as const,
    remaster: true as const,
  },
  traits: [],
  ruleElements: [],
  description: '',
};

/** A one-entry compendium, so `actor.addItem` has something to copy. */
const testCompendium: CompendiumIndex = {
  status: () => ({ available: true, packs: [], entryCount: 1, skipped: 0 }),
  search: () => [],
  get: (packId, slug) => (packId === 'equipment' && slug === 'rope' ? ROPE : undefined),
  conditions: () => new Map(),
};

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
  attachRealtime(httpServer, { activeWorld, compendium: testCompendium });
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

describe('actor.create and actor.delete', () => {
  function nextBroadcast(socket: ClientSocket): Promise<Broadcast> {
    return new Promise((resolve) => {
      socket.once('broadcast', resolve);
    });
  }

  const op = (type: string, payload: unknown) => ({
    id: crypto.randomUUID(),
    type,
    payload,
  });

  /** Two seated players and a GM, each on their own connection. */
  async function seatedTable() {
    store.putSeat(makeSeat({ name: 'GM', isGM: true, claimedByDeviceToken: 'gm' }));
    const ownerSeat = makeSeat({ name: 'Owner', claimedByDeviceToken: 'owner' });
    const otherSeat = makeSeat({ name: 'Other', claimedByDeviceToken: 'other' });
    store.putSeat(ownerSeat);
    store.putSeat(otherSeat);
    return {
      ownerSeat,
      gm: await connect('gm'),
      owner: await connect('owner'),
      other: await connect('other'),
    };
  }

  /** Every connected socket, so a test can wait for a broadcast to reach all of them before moving on (they arrive in no fixed order across connections). */
  function allSockets(table: Awaited<ReturnType<typeof seatedTable>>): ClientSocket[] {
    return [table.gm, table.owner, table.other];
  }

  it('creates an actor owned by the sender and broadcasts it to everyone', async () => {
    const { ownerSeat, gm, owner, other } = await seatedTable();
    const heard = [gm, owner, other].map(nextBroadcast);

    const ack = await emitOperation(
      owner,
      op('actor.create', { kind: 'character', name: 'Invented Hero' }),
    );
    expect(ack).toEqual({ ok: true });

    for (const broadcast of await Promise.all(heard)) {
      expect(broadcast.documents).toHaveLength(1);
      expect(broadcast.documents[0]).toMatchObject({
        type: 'actor',
        name: 'Invented Hero',
        permissions: { default: 'observer', seats: { [ownerSeat.id]: 'owner' } },
      });
    }
  });

  it('rejects a create from a connection that has not claimed a seat', async () => {
    store.putSeat(makeSeat({ name: 'GM', isGM: true, claimedByDeviceToken: 'gm' }));
    const stranger = await connect('nobody');
    const ack = await emitOperation(
      stranger,
      op('actor.create', { kind: 'character', name: 'Hero' }),
    );
    expect(ack).toEqual({ ok: false, error: 'this connection has not claimed a seat' });
    expect(store.listDocuments('actor')).toEqual([]);
  });

  it('refuses a delete from a player who does not own the actor, then allows the owner', async () => {
    const table = await seatedTable();
    const { owner, other } = table;
    const everyone = allSockets(table);
    const created = everyone.map(nextBroadcast);
    await emitOperation(owner, op('actor.create', { kind: 'character', name: 'Hero' }));
    const actorId = (await Promise.all(created))[0]?.documents[0]?.id ?? '';

    const refused = await emitOperation(other, op('actor.delete', { actorId }));
    expect(refused.ok).toBe(false);
    expect(store.getDocument(actorId)).toBeDefined();

    const heard = nextBroadcast(other);
    expect(await emitOperation(owner, op('actor.delete', { actorId }))).toEqual({
      ok: true,
    });
    const broadcast = await heard;
    expect(store.getDocument(actorId)).toBeUndefined();
    expect(broadcast.documents).toEqual([]);
    expect(broadcast.deleted.map((d) => d.id)).toEqual([actorId]);
  });

  it('applies an owner’s update and broadcasts the updated actor to the table', async () => {
    const table = await seatedTable();
    const { owner, other, gm } = table;
    const everyone = allSockets(table);
    const created = everyone.map(nextBroadcast);
    await emitOperation(owner, op('actor.create', { kind: 'character', name: 'Hero' }));
    const actorId = (await Promise.all(created))[0]?.documents[0]?.id ?? '';

    const heard = [other, gm].map(nextBroadcast);
    const ack = await emitOperation(
      owner,
      op('actor.update', { actorId, changes: { name: 'Valeria', 'system.level': 2 } }),
    );
    expect(ack).toEqual({ ok: true });

    for (const broadcast of await Promise.all(heard)) {
      expect(broadcast.documents[0]).toMatchObject({
        id: actorId,
        name: 'Valeria',
        system: { level: 2 },
      });
    }
  });

  it('refuses an update from a non-owner and from an invalid change, logging neither', async () => {
    const table = await seatedTable();
    const { owner, other } = table;
    const everyone = allSockets(table);
    const created = everyone.map(nextBroadcast);
    await emitOperation(owner, op('actor.create', { kind: 'character', name: 'Hero' }));
    const actorId = (await Promise.all(created))[0]?.documents[0]?.id ?? '';
    const sequenceBefore = store.listOperationsSince(0).length;

    const refused = await emitOperation(
      other,
      op('actor.update', { actorId, changes: { name: 'Hijack' } }),
    );
    expect(refused.ok).toBe(false);

    const invalid = await emitOperation(
      owner,
      op('actor.update', { actorId, changes: { 'system.level': 99 } }),
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.error).toContain('system.level');

    const forbidden = await emitOperation(
      owner,
      op('actor.update', { actorId, changes: { 'permissions.default': 'owner' } }),
    );
    expect(forbidden.ok).toBe(false);

    expect(store.listOperationsSince(0)).toHaveLength(sequenceBefore);
    expect(store.getDocument(actorId)).toMatchObject({
      name: 'Hero',
      system: { level: 1 },
    });
  });

  it('adds an item from the compendium and shows it to the table; an unknown entry is refused', async () => {
    const table = await seatedTable();
    const { owner } = table;
    const everyone = allSockets(table);
    const created = everyone.map(nextBroadcast);
    await emitOperation(owner, op('actor.create', { kind: 'character', name: 'Hero' }));
    const actorId = (await Promise.all(created))[0]?.documents[0]?.id ?? '';

    const heard = everyone.map(nextBroadcast);
    const ack = await emitOperation(
      owner,
      op('actor.addItem', { actorId, packId: 'equipment', slug: 'rope' }),
    );
    expect(ack).toEqual({ ok: true });
    for (const broadcast of await Promise.all(heard)) {
      expect(broadcast.documents[0]).toMatchObject({
        id: actorId,
        system: { items: [{ source: { slug: 'rope' }, entry: { name: 'Rope' } }] },
      });
    }

    const refused = await emitOperation(
      owner,
      op('actor.addItem', { actorId, packId: 'equipment', slug: 'nope' }),
    );
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain('no compendium entry');
  });

  it('adds, restacks, and removes a condition, each shown to the table', async () => {
    const table = await seatedTable();
    const { owner } = table;
    const everyone = allSockets(table);
    const created = everyone.map(nextBroadcast);
    await emitOperation(owner, op('actor.create', { kind: 'character', name: 'Hero' }));
    const actorId = (await Promise.all(created))[0]?.documents[0]?.id ?? '';

    const conditionsAfter = async (type: string, payload: object) => {
      const heard = everyone.map(nextBroadcast);
      expect(await emitOperation(owner, op(type, { actorId, ...payload }))).toEqual({
        ok: true,
      });
      const forEveryone = await Promise.all(heard);
      const seen = forEveryone.map(
        (b) => (b.documents[0]?.system as { conditions: unknown[] }).conditions,
      );
      expect(new Set(seen.map((s) => JSON.stringify(s))).size).toBe(1);
      return seen[0];
    };

    expect(
      await conditionsAfter('actor.addCondition', { slug: 'frightened', value: 2 }),
    ).toEqual([{ slug: 'frightened', value: 2 }]);
    // A weaker second source does not lower it...
    expect(
      await conditionsAfter('actor.addCondition', { slug: 'frightened', value: 1 }),
    ).toEqual([{ slug: 'frightened', value: 2 }]);
    // ...but the manual override does.
    expect(
      await conditionsAfter('actor.setCondition', { slug: 'frightened', value: 1 }),
    ).toEqual([{ slug: 'frightened', value: 1 }]);
    expect(
      await conditionsAfter('actor.removeCondition', { slug: 'frightened' }),
    ).toEqual([]);
  });

  it('rolls a check for the owner and shows the structured message to the whole table', async () => {
    const table = await seatedTable();
    const { owner, other } = table;
    const everyone = allSockets(table);
    const created = everyone.map(nextBroadcast);
    await emitOperation(owner, op('actor.create', { kind: 'character', name: 'Hero' }));
    const actorId = (await Promise.all(created))[0]?.documents[0]?.id ?? '';

    const refused = await emitOperation(
      other,
      op('actor.rollCheck', { actorId, statistic: 'perception' }),
    );
    expect(refused.ok).toBe(false);

    const heard = everyone.map(nextBroadcast);
    const ack = await emitOperation(
      owner,
      op('actor.rollCheck', { actorId, statistic: 'perception', dc: 15 }),
    );
    expect(ack).toEqual({ ok: true });
    for (const broadcast of await Promise.all(heard)) {
      const [message] = broadcast.documents;
      expect(message).toMatchObject({
        type: 'chatMessage',
        kind: 'check',
        actorId,
        label: 'Perception',
        dc: 15,
      });
      const { roll, breakdown } = chatCheckMessageSchema.parse(message);
      expect(roll.total).toBe((roll.natural ?? 0) + breakdown.total);
    }
  });

  it('routes strike rolls through the same owner check and weapon lookup', async () => {
    const table = await seatedTable();
    const { owner, other } = table;
    const everyone = allSockets(table);
    const created = everyone.map(nextBroadcast);
    await emitOperation(owner, op('actor.create', { kind: 'character', name: 'Hero' }));
    const actorId = (await Promise.all(created))[0]?.documents[0]?.id ?? '';
    const itemId = crypto.randomUUID();

    expect(
      await emitOperation(
        owner,
        op('actor.rollStrike', { actorId, itemId, attackNumber: 1 }),
      ),
    ).toEqual({ ok: false, error: `no item found with id ${itemId}` });
    expect(
      await emitOperation(
        owner,
        op('actor.rollDamage', { actorId, itemId, critical: false }),
      ),
    ).toEqual({ ok: false, error: `no item found with id ${itemId}` });
    expect(
      (
        await emitOperation(
          other,
          op('actor.rollStrike', { actorId, itemId, attackNumber: 1 }),
        )
      ).ok,
    ).toBe(false);
    expect(store.listDocuments('chatMessage')).toEqual([]);
  });

  it('lets only the GM manage the party, and drops a deleted member from it', async () => {
    const table = await seatedTable();
    const { owner, gm } = table;
    const everyone = allSockets(table);
    const created = everyone.map(nextBroadcast);
    await emitOperation(owner, op('actor.create', { kind: 'character', name: 'Hero' }));
    const actorId = (await Promise.all(created))[0]?.documents[0]?.id ?? '';

    const refused = await emitOperation(owner, op('party.addMember', { actorId }));
    expect(refused).toEqual({ ok: false, error: 'only the GM can change the party' });
    expect(store.listDocuments('party')).toEqual([]);

    const added = everyone.map(nextBroadcast);
    expect(await emitOperation(gm, op('party.addMember', { actorId }))).toEqual({
      ok: true,
    });
    for (const broadcast of await Promise.all(added)) {
      expect(broadcast.documents[0]).toMatchObject({
        type: 'party',
        memberIds: [actorId],
      });
    }

    const deleted = everyone.map(nextBroadcast);
    await emitOperation(owner, op('actor.delete', { actorId }));
    for (const broadcast of await Promise.all(deleted)) {
      expect(broadcast.deleted.map((d) => d.id)).toEqual([actorId]);
      expect(broadcast.documents[0]).toMatchObject({ type: 'party', memberIds: [] });
    }
  });

  it('does not announce a hidden actor to players when the GM edits it', async () => {
    const table = await seatedTable();
    const { owner, other, gm } = table;
    const created = allSockets(table).map(nextBroadcast);
    await emitOperation(owner, op('actor.create', { kind: 'npc', name: 'Secret' }));
    const actor = (await Promise.all(created))[0]?.documents[0];
    if (actor === undefined) {
      throw new Error('expected a created actor');
    }
    store.putDocument({ ...actor, permissions: { default: 'none', seats: {} } });

    const playersHeard = [owner, other].map(nextBroadcast);
    const gmHeard = nextBroadcast(gm);
    expect(
      await emitOperation(
        gm,
        op('actor.update', { actorId: actor.id, changes: { name: 'Renamed' } }),
      ),
    ).toEqual({ ok: true });

    // Neither player hears of the actor at all: no document, and no deletion either.
    for (const broadcast of await Promise.all(playersHeard)) {
      expect(broadcast.documents).toEqual([]);
      expect(broadcast.deleted).toEqual([]);
      expect(broadcast.operation.payload).toEqual({});
      expect(broadcast.sequence).toBeGreaterThan(0);
    }
    expect((await gmHeard).documents[0]).toMatchObject({ id: actor.id, name: 'Renamed' });
  });

  it('lets the GM delete a hidden actor without telling players it existed', async () => {
    const table = await seatedTable();
    const { owner, gm } = table;
    const everyone = allSockets(table);
    const created = everyone.map(nextBroadcast);
    await emitOperation(owner, op('actor.create', { kind: 'npc', name: 'Secret' }));
    const actor = (await Promise.all(created))[0]?.documents[0];
    if (actor === undefined) {
      throw new Error('expected a created actor');
    }
    store.putDocument({ ...actor, permissions: { default: 'none', seats: {} } });

    const playerHeard = nextBroadcast(owner);
    const gmHeard = nextBroadcast(gm);
    expect(await emitOperation(gm, op('actor.delete', { actorId: actor.id }))).toEqual({
      ok: true,
    });

    const forPlayer = await playerHeard;
    expect(forPlayer.deleted).toEqual([]);
    expect(forPlayer.operation.payload).toEqual({});
    // The player still gets the broadcast, so their sequence has no gap.
    expect(forPlayer.sequence).toBeGreaterThan(0);
    expect((await gmHeard).deleted.map((d) => d.id)).toEqual([actor.id]);
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
