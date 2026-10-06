import { createServer, type Server as HTTPServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  BaseDocument,
  Broadcast,
  ChatRollMessage,
  Seat,
  TokenDrag,
} from '@hearthtable/core';
import {
  actorSchema,
  chatCheckMessageSchema,
  sceneSchema,
  tokenSchema,
} from '@hearthtable/core';
import { creatureEntrySchema, newNpcFromCreature } from '@hearthtable/pf2e';
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

/** An invented monster, so `actor.createFromCreature` has something to copy (never a published stat block). */
const BOG_STRANGLER = creatureEntrySchema.parse({
  id: '20000000-0001-5000-8000-000000000001',
  schemaVersion: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  packId: 'bestiary',
  slug: 'invented-bog-strangler',
  name: 'Invented Bog Strangler',
  kind: 'creature',
  provenance: { publication: 'Pathfinder Monster Core', license: 'ORC', remaster: true },
  level: 3,
  size: 'large',
  perception: 8,
  ac: 19,
  savingThrows: { fortitude: 10, reflex: 6, will: 7 },
  hp: 45,
  speeds: { land: 25 },
  attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
  skills: { athletics: 11 },
  strikes: [
    {
      name: 'Vine',
      attackBonus: 11,
      traits: [],
      damage: [{ diceNumber: 1, dieFaces: 8, bonus: 4, damageType: 'bludgeoning' }],
    },
  ],
});

/** A small compendium: a rope for `actor.addItem`, and a monster for `actor.createFromCreature`. */
const testCompendium: CompendiumIndex = {
  status: () => ({ available: true, packs: [], entryCount: 2, skipped: 0 }),
  search: () => [],
  get: (packId, slug) => {
    if (packId === 'equipment' && slug === 'rope') {
      return ROPE;
    }
    return packId === 'bestiary' && slug === 'invented-bog-strangler'
      ? BOG_STRANGLER
      : undefined;
  },
  conditions: () => new Map(),
  traits: () => [],
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

  it('stores and broadcasts the optional label on the roll message', async () => {
    const { socket: sender } = await connectAndClaimSeat('device-a');
    const observer = await connect('device-b');
    const broadcastPromise = waitForBroadcast(observer);

    const ack = await emitOperation(sender, {
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      payload: { expression: '1d20+9', label: 'Pries the door open' },
    });
    expect(ack.ok).toBe(true);

    const [message] = (await broadcastPromise).documents as unknown as [ChatRollMessage];
    expect(message.label).toBe('Pries the door open');
    expect(message.roll.expression).toBe('1d20+9');
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

describe('chat.adjustRoll', () => {
  async function connectAsGM(): Promise<ClientSocket> {
    const seat = makeSeat({ isGM: true, claimedByDeviceToken: 'gm' });
    store.putSeat(seat);
    return connect('gm');
  }

  it('refuses a player: only the GM may edit a roll', async () => {
    const { socket: sender } = await connectAndClaimSeat('device-a');
    const rolled = await emitOperation(sender, {
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      payload: { expression: '1d20+5' },
    });
    expect(rolled.ok).toBe(true);
    const [message] = store.listDocuments('chatMessage') as [ChatRollMessage];

    const ack = await emitOperation(sender, {
      id: crypto.randomUUID(),
      type: 'chat.adjustRoll',
      payload: { messageId: message.id, total: 30 },
    });
    expect(ack).toEqual({ ok: false, error: 'only the GM can edit a roll' });
  });

  it("sets gmTotal and broadcasts it, leaving the roll's own total and terms untouched", async () => {
    const gm = await connectAsGM();
    const rolled = await emitOperation(gm, {
      id: crypto.randomUUID(),
      type: 'chat.sendRoll',
      payload: { expression: '1d20+5' },
    });
    expect(rolled.ok).toBe(true);
    const [before] = store.listDocuments('chatMessage') as [ChatRollMessage];

    // Connected only now, so there's no earlier broadcast in flight to race against.
    const observer = await connect('device-b');
    const broadcastPromise = waitForBroadcast(observer);
    const ack = await emitOperation(gm, {
      id: crypto.randomUUID(),
      type: 'chat.adjustRoll',
      payload: { messageId: before.id, total: 30 },
    });
    expect(ack.ok).toBe(true);

    const broadcast = await broadcastPromise;
    const [after] = broadcast.documents as unknown as [ChatRollMessage];
    expect(after.gmTotal).toBe(30);
    expect(after.roll.total).toBe(before.roll.total);
    expect(after.roll.terms).toEqual(before.roll.terms);
  });

  it('recomputes the degree of success against the stored DC from the new total', async () => {
    const gm = await connectAsGM();
    const now = new Date().toISOString();
    const message = chatCheckMessageSchema.parse({
      id: crypto.randomUUID(),
      worldId: store.world.id,
      type: 'chatMessage',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: now,
      updatedAt: now,
      seatId: crypto.randomUUID(),
      kind: 'check',
      actorId: crypto.randomUUID(),
      actorName: 'Ada',
      statistic: 'skill:athletics',
      label: 'Athletics',
      dc: 15,
      breakdown: { total: 10, modifiers: [] },
      roll: {
        expression: '1d20+10',
        total: 10,
        terms: [],
        natural: 10,
        degree: 'failure',
      },
    });
    store.putDocument(message);

    const ack = await emitOperation(gm, {
      id: crypto.randomUUID(),
      type: 'chat.adjustRoll',
      payload: { messageId: message.id, total: 20 },
    });
    expect(ack.ok).toBe(true);

    const stored = store.getDocument(message.id);
    expect(stored).toMatchObject({ gmTotal: 20, roll: { total: 10, degree: 'success' } });
  });

  it('refuses a message that is not a roll', async () => {
    const gm = await connectAsGM();
    const sent = await emitOperation(gm, {
      id: crypto.randomUUID(),
      type: 'chat.sendMessage',
      payload: { text: 'hello' },
    });
    expect(sent.ok).toBe(true);
    const [message] = store.listDocuments('chatMessage') as [{ id: string }];

    const ack = await emitOperation(gm, {
      id: crypto.randomUUID(),
      type: 'chat.adjustRoll',
      payload: { messageId: message.id, total: 20 },
    });
    expect(ack).toEqual({ ok: false, error: 'this message is not a roll' });
  });

  it('refuses an unknown message id', async () => {
    const gm = await connectAsGM();
    const ack = await emitOperation(gm, {
      id: crypto.randomUUID(),
      type: 'chat.adjustRoll',
      payload: { messageId: crypto.randomUUID(), total: 20 },
    });
    expect(ack.ok).toBe(false);
    expect(ack.error).toMatch(/no chat message found/);
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

describe('scene.create, scene.update, and scene.delete', () => {
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

  /** A GM and a player, each on their own connection. */
  async function table() {
    store.putSeat(makeSeat({ name: 'GM', isGM: true, claimedByDeviceToken: 'gm' }));
    store.putSeat(makeSeat({ name: 'Player', claimedByDeviceToken: 'player' }));
    return { gm: await connect('gm'), player: await connect('player') };
  }

  /** Creates a scene as the GM and returns it, once both sockets have heard the broadcast. */
  async function createScene(t: Awaited<ReturnType<typeof table>>, name = 'The Crypt') {
    const heard = [t.gm, t.player].map(nextBroadcast);
    expect(
      await emitOperation(t.gm, op('scene.create', { name, kind: 'battle' })),
    ).toEqual({ ok: true });
    const [forGm, forPlayer] = await Promise.all(heard);
    const scene = forGm?.documents[0];
    if (scene === undefined || forGm === undefined || forPlayer === undefined) {
      throw new Error('expected a created scene');
    }
    return { scene, forGm, forPlayer };
  }

  it('creates a scene the GM sees and the player never hears of', async () => {
    const t = await table();
    const { scene, forGm, forPlayer } = await createScene(t);

    expect(scene).toMatchObject({ type: 'scene', name: 'The Crypt', kind: 'battle' });
    expect(forGm.operation.payload).toEqual({ name: 'The Crypt', kind: 'battle' });
    // The player still gets the broadcast, so their sequence has no gap, but nothing in it.
    expect(forPlayer.documents).toEqual([]);
    expect(forPlayer.deleted).toEqual([]);
    expect(forPlayer.operation.payload).toEqual({});
    expect(forPlayer.sequence).toBe(forGm.sequence);
  });

  it('refuses a player, logging nothing', async () => {
    const t = await table();
    const before = store.listOperationsSince(0).length;
    expect(
      await emitOperation(t.player, op('scene.create', { name: 'Mine', kind: 'area' })),
    ).toEqual({ ok: false, error: 'only the GM can change scenes' });
    expect(store.listOperationsSince(0)).toHaveLength(before);
    expect(store.listDocuments('scene')).toEqual([]);
  });

  it('updates a hidden scene for the GM only', async () => {
    const t = await table();
    const { scene } = await createScene(t);

    const heard = [t.gm, t.player].map(nextBroadcast);
    expect(
      await emitOperation(
        t.gm,
        op('scene.update', {
          sceneId: scene.id,
          changes: { name: 'Renamed', grid: { size: 70 } },
        }),
      ),
    ).toEqual({ ok: true });
    const [forGm, forPlayer] = await Promise.all(heard);

    expect(forGm?.documents[0]).toMatchObject({
      id: scene.id,
      name: 'Renamed',
      grid: { size: 70, distance: 5 },
    });
    expect(forPlayer?.documents).toEqual([]);
    expect(forPlayer?.deleted).toEqual([]);
  });

  it('rejects a player’s update and an update that breaks the schema', async () => {
    const t = await table();
    const { scene } = await createScene(t);
    expect(
      await emitOperation(
        t.player,
        op('scene.update', { sceneId: scene.id, changes: { name: 'Hijack' } }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await emitOperation(
        t.gm,
        op('scene.update', { sceneId: scene.id, changes: { background: 'map.png' } }),
      ),
    ).toEqual({ ok: false, error: 'background must be the name of an uploaded image' });
    expect(
      await emitOperation(t.gm, op('scene.update', { sceneId: scene.id, changes: {} })),
    ).toEqual({ ok: false, error: 'invalid operation' });
    expect((store.getDocument(scene.id) as { name: string }).name).toBe('The Crypt');
  });

  it('deletes a hidden scene without telling the player it existed', async () => {
    const t = await table();
    const { scene } = await createScene(t);

    const heard = [t.gm, t.player].map(nextBroadcast);
    expect(await emitOperation(t.gm, op('scene.delete', { sceneId: scene.id }))).toEqual({
      ok: true,
    });
    const [forGm, forPlayer] = await Promise.all(heard);

    expect(forGm?.deleted.map((d) => d.id)).toEqual([scene.id]);
    expect(forPlayer?.deleted).toEqual([]);
    expect(forPlayer?.documents).toEqual([]);
    expect(store.getDocument(scene.id)).toBeUndefined();
  });

  it('tells a player a scene they could see is gone, along with the party leaving it', async () => {
    const t = await table();
    const { scene } = await createScene(t);
    // Reveal the scene and put the party in it, as moving the party will later.
    store.putDocument({ ...scene, permissions: { default: 'observer', seats: {} } });
    const now = new Date().toISOString();
    const party = {
      id: crypto.randomUUID(),
      worldId: store.world.id,
      type: 'party' as const,
      schemaVersion: 1,
      permissions: { default: 'observer' as const, seats: {} },
      createdAt: now,
      updatedAt: now,
      name: 'Party',
      memberIds: [],
      level: 1,
      sceneId: scene.id,
    };
    store.putDocument(party);

    const heard = [t.gm, t.player].map(nextBroadcast);
    expect(await emitOperation(t.gm, op('scene.delete', { sceneId: scene.id }))).toEqual({
      ok: true,
    });
    const [forGm, forPlayer] = await Promise.all(heard);

    for (const broadcast of [forGm, forPlayer]) {
      expect(broadcast?.deleted.map((d) => d.id)).toEqual([scene.id]);
      expect(broadcast?.documents[0]).toMatchObject({ id: party.id });
      expect(broadcast?.documents[0]).not.toHaveProperty('sceneId');
    }
  });
});

describe('scene.addLink and scene.removeLink', () => {
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

  /** A GM, a player, and two scenes made by the GM. */
  async function setup() {
    store.putSeat(makeSeat({ name: 'GM', isGM: true, claimedByDeviceToken: 'gm' }));
    store.putSeat(makeSeat({ name: 'Player', claimedByDeviceToken: 'player' }));
    const gm = await connect('gm');
    const player = await connect('player');
    const made: Broadcast[] = [];
    for (const name of ['Here', 'There']) {
      const heard = [gm, player].map(nextBroadcast);
      await emitOperation(gm, op('scene.create', { name, kind: 'area' }));
      const [forGm] = await Promise.all(heard);
      if (forGm === undefined) {
        throw new Error('expected a broadcast');
      }
      made.push(forGm);
    }
    const [here, there] = made.map((b) => b.documents[0]);
    if (here === undefined || there === undefined) {
      throw new Error('expected two scenes');
    }
    return { gm, player, here, there };
  }

  it('adds and removes an exit on a hidden scene for the GM only', async () => {
    const { gm, player, here, there } = await setup();

    const added = [gm, player].map(nextBroadcast);
    expect(
      await emitOperation(
        gm,
        op('scene.addLink', {
          sceneId: here.id,
          label: 'To the cellar',
          x: 400,
          y: 250,
          targetSceneId: there.id,
        }),
      ),
    ).toEqual({ ok: true });
    const [forGm, forPlayer] = await Promise.all(added);
    const linked = sceneSchema.parse(forGm?.documents[0]);
    expect(linked.links.map((l) => l.label)).toEqual(['To the cellar']);
    expect(forPlayer?.documents).toEqual([]);
    expect(forPlayer?.deleted).toEqual([]);

    const removed = [gm, player].map(nextBroadcast);
    const linkId = linked.links[0]?.id ?? '';
    expect(
      await emitOperation(gm, op('scene.removeLink', { sceneId: here.id, linkId })),
    ).toEqual({ ok: true });
    const [removedForGm, removedForPlayer] = await Promise.all(removed);
    expect(sceneSchema.parse(removedForGm?.documents[0]).links).toEqual([]);
    expect(removedForPlayer?.documents).toEqual([]);
  });

  it('shows a player the new exit once the scene is one they can see', async () => {
    const { gm, player, here, there } = await setup();
    store.putDocument({ ...here, permissions: { default: 'observer', seats: {} } });

    const heard = [gm, player].map(nextBroadcast);
    await emitOperation(
      gm,
      op('scene.addLink', {
        sceneId: here.id,
        label: 'Door',
        x: 10,
        y: 10,
        targetSceneId: there.id,
      }),
    );
    for (const broadcast of await Promise.all(heard)) {
      expect(broadcast.documents[0]).toMatchObject({
        id: here.id,
        links: [{ label: 'Door', targetSceneId: there.id }],
      });
    }
  });

  it('refuses a player and a link off the scene, logging neither', async () => {
    const { gm, player, here, there } = await setup();
    const before = store.listOperationsSince(0).length;
    const link = (x: number) => ({
      sceneId: here.id,
      label: 'x',
      x,
      y: 10,
      targetSceneId: there.id,
    });
    expect(await emitOperation(player, op('scene.addLink', link(10)))).toEqual({
      ok: false,
      error: 'only the GM can change scenes',
    });
    expect(await emitOperation(gm, op('scene.addLink', link(5000)))).toMatchObject({
      ok: false,
    });
    expect(store.listOperationsSince(0)).toHaveLength(before);
  });
});

describe('scene.activate', () => {
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

  /** Sends `operation` from `from` and returns what the GM and the player each heard. */
  async function send(
    from: ClientSocket,
    both: { gm: ClientSocket; player: ClientSocket },
    operation: ReturnType<typeof op>,
  ) {
    const heard = [both.gm, both.player].map(nextBroadcast);
    expect(await emitOperation(from, operation)).toEqual({ ok: true });
    const [forGm, forPlayer] = await Promise.all(heard);
    if (forGm === undefined || forPlayer === undefined) {
      throw new Error('expected both broadcasts');
    }
    return { forGm, forPlayer };
  }

  it('moves the party between scenes, taking the old scene and its tokens away from a player who held them', async () => {
    store.putSeat(makeSeat({ name: 'GM', isGM: true, claimedByDeviceToken: 'gm' }));
    store.putSeat(makeSeat({ name: 'Player', claimedByDeviceToken: 'player' }));
    const table = { gm: await connect('gm'), player: await connect('player') };

    // The player makes a character, the GM puts it in the party and makes two scenes.
    const created = await send(
      table.player,
      table,
      op('actor.create', { kind: 'character', name: 'Hero' }),
    );
    const hero = created.forGm.documents[0];
    if (hero === undefined) {
      throw new Error('expected a created actor');
    }
    await send(table.gm, table, op('party.addMember', { actorId: hero.id }));
    const sceneIds: string[] = [];
    for (const name of ['Crypt', 'Garden']) {
      const made = await send(
        table.gm,
        table,
        op('scene.create', { name, kind: 'area' }),
      );
      sceneIds.push(made.forGm.documents[0]?.id ?? '');
    }
    const [crypt, garden] = sceneIds as [string, string];

    // A hidden monster the GM has placed in the garden, before anyone arrives.
    const now = new Date().toISOString();
    const lurker = tokenSchema.parse({
      id: crypto.randomUUID(),
      worldId: store.world.id,
      type: 'token',
      schemaVersion: 1,
      permissions: { default: 'none', seats: {} },
      createdAt: now,
      updatedAt: now,
      sceneId: garden,
      actorId: crypto.randomUUID(),
      x: 300,
      y: 300,
      size: 2,
      hidden: true,
    });
    store.putDocument(lurker);

    // Into the crypt: the player is given the scene, the party, and their own token.
    const enter = await send(table.gm, table, op('scene.activate', { sceneId: crypt }));
    const heardTypes = enter.forPlayer.documents.map((d) => d.type).sort();
    expect(heardTypes).toEqual(['party', 'scene', 'token']);
    const cryptToken = enter.forPlayer.documents.find((d) => d.type === 'token');
    expect(cryptToken).toMatchObject({ sceneId: crypt, actorId: hero.id });
    expect(enter.forPlayer.documents.find((d) => d.type === 'scene')?.id).toBe(crypt);
    expect(enter.forPlayer.deleted).toEqual([]);

    // On to the garden: the crypt and its token are taken away, the garden and a new token arrive,
    // and the hidden monster is never mentioned to the player.
    const leave = await send(table.gm, table, op('scene.activate', { sceneId: garden }));
    expect(leave.forPlayer.deleted.map((d) => d.id).sort()).toEqual(
      [crypt, cryptToken?.id ?? ''].sort(),
    );
    expect(leave.forPlayer.deleted.every((d) => !('sceneId' in d))).toBe(true);
    const arrived = leave.forPlayer.documents;
    expect(arrived.map((d) => d.type).sort()).toEqual(['party', 'scene', 'token']);
    expect(arrived.find((d) => d.type === 'scene')?.id).toBe(garden);
    expect(arrived.find((d) => d.type === 'token')).toMatchObject({
      sceneId: garden,
      actorId: hero.id,
    });
    const everythingThePlayerHeard = JSON.stringify(leave.forPlayer);
    expect(everythingThePlayerHeard).not.toContain(lurker.id);

    // The GM was never told to drop anything.
    expect(leave.forGm.deleted).toEqual([]);
    expect(store.getDocument(lurker.id)).toMatchObject({ hidden: true });
  });

  it('refuses a player, logging nothing', async () => {
    store.putSeat(makeSeat({ name: 'GM', isGM: true, claimedByDeviceToken: 'gm' }));
    store.putSeat(makeSeat({ name: 'Player', claimedByDeviceToken: 'player' }));
    const table = { gm: await connect('gm'), player: await connect('player') };
    const made = await send(
      table.gm,
      table,
      op('scene.create', { name: 'Crypt', kind: 'area' }),
    );
    const before = store.listOperationsSince(0).length;

    expect(
      await emitOperation(
        table.player,
        op('scene.activate', { sceneId: made.forGm.documents[0]?.id }),
      ),
    ).toEqual({ ok: false, error: 'only the GM can change scenes' });
    expect(store.listOperationsSince(0)).toHaveLength(before);
  });
});

describe('token.create, token.update, token.delete', () => {
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

  type Table = { gm: ClientSocket; player: ClientSocket };

  /** Sends `operation` from `from` and returns what the GM and the player each heard. */
  async function send(
    from: ClientSocket,
    table: Table,
    operation: ReturnType<typeof op>,
  ) {
    const heard = [table.gm, table.player].map(nextBroadcast);
    expect(await emitOperation(from, operation)).toEqual({ ok: true });
    const [forGm, forPlayer] = await Promise.all(heard);
    if (forGm === undefined || forPlayer === undefined) {
      throw new Error('expected both broadcasts');
    }
    return { forGm, forPlayer };
  }

  /** A player with a character in the party, standing in a scene the party has entered. */
  async function inTheCrypt() {
    store.putSeat(makeSeat({ name: 'GM', isGM: true, claimedByDeviceToken: 'gm' }));
    store.putSeat(makeSeat({ name: 'Player', claimedByDeviceToken: 'player' }));
    const table: Table = { gm: await connect('gm'), player: await connect('player') };
    const made = await send(
      table.player,
      table,
      op('actor.create', { kind: 'character', name: 'Hero' }),
    );
    const heroId = made.forGm.documents[0]?.id ?? '';
    await send(table.gm, table, op('party.addMember', { actorId: heroId }));
    const crypt = await send(
      table.gm,
      table,
      op('scene.create', { name: 'Crypt', kind: 'battle' }),
    );
    const sceneId = crypt.forGm.documents[0]?.id ?? '';
    const entered = await send(table.gm, table, op('scene.activate', { sceneId }));
    const heroToken = entered.forPlayer.documents.find((d) => d.type === 'token');
    if (heroToken === undefined) {
      throw new Error('expected the hero to have a token');
    }
    return { table, heroId, sceneId, heroToken };
  }

  async function newNpc(table: Table, name: string): Promise<string> {
    const made = await send(table.gm, table, op('actor.create', { kind: 'npc', name }));
    return made.forGm.documents[0]?.id ?? '';
  }

  it('takes a token away from a player when the GM hides it, and gives it back when shown', async () => {
    const { table, heroToken } = await inTheCrypt();

    const hide = await send(
      table.gm,
      table,
      op('token.update', { tokenId: heroToken.id, changes: { hidden: true } }),
    );
    // The player is told to drop it, and is sent nothing about it.
    expect(hide.forPlayer.deleted.map((d) => d.id)).toEqual([heroToken.id]);
    expect(hide.forPlayer.documents).toEqual([]);
    // The GM still has it, now marked hidden.
    expect(hide.forGm.deleted).toEqual([]);
    expect(hide.forGm.documents[0]).toMatchObject({ id: heroToken.id, hidden: true });

    const show = await send(
      table.gm,
      table,
      op('token.update', { tokenId: heroToken.id, changes: { hidden: false } }),
    );
    expect(show.forPlayer.documents.map((d) => d.id)).toEqual([heroToken.id]);
    expect(show.forPlayer.documents[0]).toMatchObject({ hidden: false });
    expect(show.forPlayer.deleted).toEqual([]);
  });

  it("gives players an NPC token's health as a percentage only, and only once the GM shows the bar", async () => {
    const { table, sceneId } = await inTheCrypt();
    // A bare NPC has no hit points to report and is public, so make this one a creature's: monster stats, GM-only.
    const bareId = await newNpc(table, 'Guard');
    const bare = actorSchema.parse(store.getDocument(bareId));
    store.putDocument({
      ...bare,
      permissions: { default: 'none', seats: {} },
      system: { ...newNpcFromCreature(BOG_STRANGLER) },
    } as BaseDocument);
    const actorId = bareId;
    const made = await send(table.gm, table, op('token.create', { sceneId, actorId }));
    const tokenId = made.forGm.documents[0]?.id ?? '';
    // Bars start hidden: no percentage reaches anyone.
    expect(made.forPlayer.documents[0]).not.toHaveProperty('hpBar');

    const shown = await send(
      table.gm,
      table,
      op('token.update', { tokenId, changes: { showHpBar: true } }),
    );
    expect(tokenSchema.parse(shown.forPlayer.documents[0]).hpBar).toEqual({
      percent: 100,
    });

    const hurt = await send(
      table.gm,
      table,
      op('actor.applyDamage', { actorId, amount: 1 }),
    );
    // The player hears about the token, never the NPC's own document.
    expect(hurt.forPlayer.documents.map((d) => d.id)).not.toContain(actorId);
    const heard = hurt.forPlayer.documents.find((d) => d.id === tokenId);
    expect(tokenSchema.parse(heard).hpBar?.percent).toBeLessThan(100);
    expect(JSON.stringify(hurt.forPlayer)).not.toContain('"hp"');
  });

  it('keeps a hidden token from the player from the moment it is created, and shows an ordinary one', async () => {
    const { table, sceneId } = await inTheCrypt();
    const lurkerActor = await newNpc(table, 'Lurker');
    const guardActor = await newNpc(table, 'Guard');

    const lurker = await send(
      table.gm,
      table,
      op('token.create', { sceneId, actorId: lurkerActor, hidden: true }),
    );
    expect(lurker.forGm.documents[0]).toMatchObject({
      actorId: lurkerActor,
      hidden: true,
    });
    expect(lurker.forPlayer.documents).toEqual([]);
    expect(lurker.forPlayer.deleted).toEqual([]);

    const guard = await send(
      table.gm,
      table,
      op('token.create', { sceneId, actorId: guardActor, at: { x: 450, y: 450 } }),
    );
    expect(guard.forPlayer.documents[0]).toMatchObject({
      actorId: guardActor,
      x: 450,
      y: 450,
    });

    // Editing the hidden token afterwards still tells the player nothing at all.
    const lurkerToken = lurker.forGm.documents[0];
    const edit = await send(
      table.gm,
      table,
      op('token.update', { tokenId: lurkerToken?.id, changes: { name: 'Shadow' } }),
    );
    expect(edit.forPlayer.documents).toEqual([]);
    expect(edit.forPlayer.deleted).toEqual([]);
    expect(JSON.stringify(edit.forPlayer)).not.toContain(lurkerToken?.id ?? 'x');
  });

  it('shows a pre-placed token to no one until the party arrives', async () => {
    const { table } = await inTheCrypt();
    const garden = await send(
      table.gm,
      table,
      op('scene.create', { name: 'Garden', kind: 'area' }),
    );
    const gardenId = garden.forGm.documents[0]?.id ?? '';
    const actorId = await newNpc(table, 'Gardener');

    const placed = await send(
      table.gm,
      table,
      op('token.create', { sceneId: gardenId, actorId }),
    );
    expect(placed.forPlayer.documents).toEqual([]);
    expect(placed.forPlayer.deleted).toEqual([]);
  });

  it('tells a player a token they could see is gone, and says nothing about a hidden one', async () => {
    const { table, sceneId } = await inTheCrypt();
    const seenActor = await newNpc(table, 'Seen');
    const unseenActor = await newNpc(table, 'Unseen');
    const seen = await send(
      table.gm,
      table,
      op('token.create', { sceneId, actorId: seenActor }),
    );
    const unseen = await send(
      table.gm,
      table,
      op('token.create', { sceneId, actorId: unseenActor, hidden: true }),
    );
    const seenId = seen.forGm.documents[0]?.id ?? '';
    const unseenId = unseen.forGm.documents[0]?.id ?? '';

    const removedSeen = await send(
      table.gm,
      table,
      op('token.delete', { tokenId: seenId }),
    );
    expect(removedSeen.forPlayer.deleted.map((d) => d.id)).toEqual([seenId]);
    expect(removedSeen.forGm.deleted.map((d) => d.id)).toEqual([seenId]);

    const removedUnseen = await send(
      table.gm,
      table,
      op('token.delete', { tokenId: unseenId }),
    );
    expect(removedUnseen.forPlayer.deleted).toEqual([]);
    expect(removedUnseen.forGm.deleted.map((d) => d.id)).toEqual([unseenId]);
  });

  it('removes an actor’s token for everyone when the actor is deleted', async () => {
    const { table, heroId, heroToken } = await inTheCrypt();
    const gone = await send(table.player, table, op('actor.delete', { actorId: heroId }));
    for (const heard of [gone.forGm, gone.forPlayer]) {
      expect(heard.deleted.map((d) => d.id).sort()).toEqual(
        [heroId, heroToken.id].sort(),
      );
    }
    expect(store.getDocument(heroToken.id)).toBeUndefined();
  });

  it('lets a player move their own token, and shows the settled position to the whole table', async () => {
    const { table, heroToken } = await inTheCrypt();

    const moved = await send(
      table.player,
      table,
      op('token.move', { tokenId: heroToken.id, x: 710, y: 820 }),
    );

    // Snapped to the grid by the server, and the same for everyone.
    for (const heard of [moved.forGm, moved.forPlayer]) {
      expect(heard.documents).toHaveLength(1);
      expect(heard.documents[0]).toMatchObject({ id: heroToken.id, x: 750, y: 850 });
      expect(heard.deleted).toEqual([]);
    }
    expect(moved.forGm.operation.payload).toEqual({
      tokenId: heroToken.id,
      x: 710,
      y: 820,
    });
  });

  it('lets the GM move any token, and the player sees it move', async () => {
    const { table, sceneId, heroToken } = await inTheCrypt();
    const moved = await send(
      table.gm,
      table,
      op('token.move', { tokenId: heroToken.id, x: 1250, y: 1350 }),
    );
    expect(moved.forPlayer.documents[0]).toMatchObject({
      id: heroToken.id,
      x: 1250,
      y: 1350,
    });

    // A monster the GM placed in plain sight is the GM's to move, not the player's.
    const guardActor = await newNpc(table, 'Guard');
    const guard = await send(
      table.gm,
      table,
      op('token.create', { sceneId, actorId: guardActor, at: { x: 450, y: 450 } }),
    );
    const guardToken = guard.forGm.documents[0];
    const attempt = await emitOperation(
      table.player,
      op('token.move', { tokenId: guardToken?.id, x: 550, y: 550 }),
    );
    expect(attempt).toEqual({
      ok: false,
      error: 'you do not have permission to move this token',
    });
    expect(store.getDocument(guardToken?.id ?? '')).toMatchObject({ x: 450, y: 450 });
  });

  it('does not let a player move, or learn of, a hidden token', async () => {
    const { table, sceneId, heroId } = await inTheCrypt();
    // A hidden token for the player's own character: they own the actor but cannot see the token.
    const hiddenToken = await send(
      table.gm,
      table,
      op('token.create', { sceneId, actorId: heroId, hidden: true }),
    );
    const hiddenId = hiddenToken.forGm.documents[0]?.id ?? '';
    expect(hiddenToken.forPlayer.documents).toEqual([]);

    const before = store.listOperationsSince(0).length;
    const refused = await emitOperation(
      table.player,
      op('token.move', { tokenId: hiddenId, x: 150, y: 150 }),
    );
    expect(refused).toEqual({ ok: false, error: `no token found with id ${hiddenId}` });
    expect(store.listOperationsSince(0)).toHaveLength(before);
  });

  it("spends the Strides a move costs on the hero's own turn, and lets one that overspends through with a warning", async () => {
    const { table, heroToken } = await inTheCrypt();
    const created = await send(
      table.gm,
      table,
      op('combat.create', { sceneId: heroToken.sceneId as string }),
    );
    const combatId = created.forGm.documents.find((d) => d.type === 'combat')?.id ?? '';
    await send(table.gm, table, op('combat.start', { combatId }));

    const tokenOf = (heard: { documents: { id: string; type: string }[] }) =>
      heard.documents.find((d) => d.type === 'token') as
        { id: string; x: number; y: number } | undefined;
    const combatantOf = (heard: { documents: { type: string }[] }) =>
      heard.documents.find((d) => d.type === 'combatant');

    const start = { x: heroToken.x as number, y: heroToken.y as number };
    const move = (x: number, y: number) =>
      send(table.player, table, op('token.move', { tokenId: heroToken.id, x, y }));

    const first = await move(start.x + 500, start.y);
    expect(combatantOf(first.forPlayer)).toMatchObject({
      turn: { actionsSpent: 1 },
    });

    const second = await move(start.x, start.y);
    expect(combatantOf(second.forPlayer)).toMatchObject({
      turn: { actionsSpent: 2 },
    });

    const third = await move(start.x + 500, start.y);
    expect(combatantOf(third.forPlayer)).toMatchObject({
      turn: { actionsSpent: 3 },
    });
    const landed = tokenOf(third.forPlayer);

    // At capacity: five more feet needs a fourth Stride. Never refused (ADR
    // 0023): the move goes through and the tracker shows the overspend.
    const over = await move(start.x + 600, start.y);
    expect(combatantOf(over.forPlayer)).toMatchObject({ turn: { actionsSpent: 4 } });
    expect(tokenOf(over.forPlayer)).toMatchObject({ x: start.x + 600, y: start.y });
    expect(JSON.stringify(over.forPlayer.documents)).toContain(
      'has spent 4 of 3 actions',
    );
    expect(landed).toBeDefined();
  });

  it("undoes a move and the GM's damage from the same step together, then has nothing left", async () => {
    const { table, heroId, heroToken } = await inTheCrypt();
    const created = await send(
      table.gm,
      table,
      op('combat.create', { sceneId: heroToken.sceneId as string }),
    );
    const combatId = created.forGm.documents.find((d) => d.type === 'combat')?.id ?? '';
    await send(table.gm, table, op('combat.start', { combatId }));

    const start = { x: heroToken.x as number, y: heroToken.y as number };
    const actorBefore = store.getDocument(heroId);

    await send(
      table.player,
      table,
      op('token.move', { tokenId: heroToken.id, x: start.x + 500, y: start.y }),
    );
    await send(table.gm, table, op('actor.applyDamage', { actorId: heroId, amount: 5 }));
    expect(store.getDocument(heroId)).not.toEqual(actorBefore);

    const undone = await send(table.player, table, op('combat.undo', { combatId }));
    expect(store.getDocument(heroToken.id)).toMatchObject(start);
    expect(store.getDocument(heroId)).toEqual(actorBefore);
    expect(undone.forGm.documents.map((d) => d.id)).toContain(heroId);

    expect(await emitOperation(table.player, op('combat.undo', { combatId }))).toEqual({
      ok: false,
      error: 'there is nothing to undo this turn',
    });
  });

  it("refuses a player undoing the GM's own step, but lets the GM undo it", async () => {
    const { table, heroToken } = await inTheCrypt();
    const created = await send(
      table.gm,
      table,
      op('combat.create', { sceneId: heroToken.sceneId as string }),
    );
    const combatId = created.forGm.documents.find((d) => d.type === 'combat')?.id ?? '';
    await send(table.gm, table, op('combat.start', { combatId }));
    const start = { x: heroToken.x as number, y: heroToken.y as number };

    // The GM moves the hero's token themselves, opening a step under the GM's own seat.
    await send(
      table.gm,
      table,
      op('token.move', { tokenId: heroToken.id, x: start.x + 500, y: start.y }),
    );

    expect(await emitOperation(table.player, op('combat.undo', { combatId }))).toEqual({
      ok: false,
      error: 'only the GM can undo someone else’s action',
    });
    await send(table.gm, table, op('combat.undo', { combatId }));
    expect(store.getDocument(heroToken.id)).toMatchObject(start);
  });

  it('refuses a player for every token operation, logging none', async () => {
    const { table, sceneId, heroId, heroToken } = await inTheCrypt();
    const before = store.listOperationsSince(0).length;
    const refused = { ok: false, error: 'only the GM can change tokens' };

    expect(
      await emitOperation(table.player, op('token.create', { sceneId, actorId: heroId })),
    ).toEqual(refused);
    expect(
      await emitOperation(
        table.player,
        op('token.update', { tokenId: heroToken.id, changes: { hidden: true } }),
      ),
    ).toEqual(refused);
    expect(
      await emitOperation(table.player, op('token.delete', { tokenId: heroToken.id })),
    ).toEqual(refused);
    expect(store.listOperationsSince(0)).toHaveLength(before);
  });
});

describe('actor.createFromCreature', () => {
  const op = (type: string, payload: unknown) => ({
    id: crypto.randomUUID(),
    type,
    payload,
  });

  function nextBroadcast(socket: ClientSocket): Promise<Broadcast> {
    return new Promise((resolve) => {
      socket.once('broadcast', resolve);
    });
  }

  async function table() {
    store.putSeat(makeSeat({ name: 'GM', isGM: true, claimedByDeviceToken: 'gm' }));
    store.putSeat(makeSeat({ name: 'Player', claimedByDeviceToken: 'player' }));
    const sockets = { gm: await connect('gm'), player: await connect('player') };
    const send = async (from: ClientSocket, operation: ReturnType<typeof op>) => {
      const heard = [sockets.gm, sockets.player].map(nextBroadcast);
      expect(await emitOperation(from, operation)).toEqual({ ok: true });
      const [forGm, forPlayer] = await Promise.all(heard);
      if (forGm === undefined || forPlayer === undefined) {
        throw new Error('expected both broadcasts');
      }
      return { forGm, forPlayer };
    };
    return { ...sockets, send };
  }

  const strangler = { packId: 'bestiary', slug: 'invented-bog-strangler' };

  it('gives the GM a monster the player never hears of', async () => {
    const t = await table();
    const { forGm, forPlayer } = await t.send(
      t.gm,
      op('actor.createFromCreature', strangler),
    );

    expect(forGm.documents[0]).toMatchObject({
      type: 'actor',
      kind: 'npc',
      name: 'Invented Bog Strangler',
      system: { hp: { current: 45, temp: 0 }, creature: { ac: 19, size: 'large' } },
    });
    // Nothing of it reaches the player: no document, no deletion, and not even the request.
    expect(forPlayer.documents).toEqual([]);
    expect(forPlayer.deleted).toEqual([]);
    expect(forPlayer.operation.payload).toEqual({});
    expect(JSON.stringify(forPlayer)).not.toContain('Bog Strangler');
  });

  it('shows the player the monster’s token, a large one, but still never its sheet', async () => {
    const t = await table();
    const made = await t.send(t.gm, op('actor.createFromCreature', strangler));
    const actorId = made.forGm.documents[0]?.id ?? '';
    const scene = await t.send(t.gm, op('scene.create', { name: 'Bog', kind: 'battle' }));
    const sceneId = scene.forGm.documents[0]?.id ?? '';
    await t.send(t.gm, op('scene.activate', { sceneId }));

    const placed = await t.send(t.gm, op('token.create', { sceneId, actorId }));

    expect(placed.forPlayer.documents).toHaveLength(1);
    expect(placed.forPlayer.documents[0]).toMatchObject({
      type: 'token',
      actorId,
      size: 2,
    });
    // The token carries a position and a size, and none of the monster's numbers.
    const heard = JSON.stringify(placed.forPlayer);
    for (const secret of ['savingThrows', 'creature', 'Bog Strangler', '"hp"', '"ac"']) {
      expect(heard).not.toContain(secret);
    }
  });

  it('refuses a player, and an entry that is not a creature or not there, logging none', async () => {
    const t = await table();
    const before = store.listOperationsSince(0).length;

    expect(
      await emitOperation(t.player, op('actor.createFromCreature', strangler)),
    ).toEqual({
      ok: false,
      error: 'only the GM can add a monster',
    });
    expect(
      await emitOperation(
        t.gm,
        op('actor.createFromCreature', { packId: 'equipment', slug: 'rope' }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await emitOperation(
        t.gm,
        op('actor.createFromCreature', { packId: 'bestiary', slug: 'nope' }),
      ),
    ).toMatchObject({ ok: false });
    expect(store.listOperationsSince(0)).toHaveLength(before);
    expect(store.listDocuments('actor')).toEqual([]);
  });

  it('lets the GM change its hit points, and still tells the player nothing', async () => {
    const t = await table();
    const made = await t.send(t.gm, op('actor.createFromCreature', strangler));
    const actorId = made.forGm.documents[0]?.id ?? '';

    const hurt = await t.send(
      t.gm,
      op('actor.update', { actorId, changes: { 'system.hp.current': 12 } }),
    );

    expect(hurt.forGm.documents[0]).toMatchObject({ system: { hp: { current: 12 } } });
    expect(hurt.forPlayer.documents).toEqual([]);
    expect(hurt.forPlayer.deleted).toEqual([]);
  });

  it('lets the GM roll its strike and a skill, posting to the table without exposing the sheet', async () => {
    const t = await table();
    const made = await t.send(t.gm, op('actor.createFromCreature', strangler));
    const actorId = made.forGm.documents[0]?.id ?? '';

    const attack = await t.send(
      t.gm,
      op('actor.rollStrike', { actorId, strikeKey: 'strike:vine', attackNumber: 1 }),
    );
    const damage = await t.send(
      t.gm,
      op('actor.rollDamage', { actorId, strikeKey: 'strike:vine', critical: true }),
    );
    const check = await t.send(
      t.gm,
      op('actor.rollCheck', { actorId, statistic: 'skill:athletics' }),
    );

    for (const [heard, kind] of [
      [attack, 'strikeAttack'],
      [damage, 'strikeDamage'],
      [check, 'check'],
    ] as const) {
      expect(heard.forGm.documents[0]).toMatchObject({ kind, actorId });
      // The roll is public, like any chat message; the monster behind it is not.
      expect(heard.forPlayer.documents).toHaveLength(1);
      expect(heard.forPlayer.documents[0]).toMatchObject({ kind, actorId });
      expect(JSON.stringify(heard.forPlayer)).not.toContain('savingThrows');
    }
    expect(attack.forPlayer.documents[0]).toMatchObject({ strikeKey: 'strike:vine' });
  });

  it('lets the GM frighten and then free a monster, and still tells the player nothing', async () => {
    const t = await table();
    const made = await t.send(t.gm, op('actor.createFromCreature', strangler));
    const actorId = made.forGm.documents[0]?.id ?? '';

    const scared = await t.send(
      t.gm,
      op('actor.addCondition', { actorId, slug: 'frightened', value: 2 }),
    );
    expect(scared.forGm.documents[0]).toMatchObject({
      system: { conditions: [{ slug: 'frightened', value: 2 }] },
    });
    expect(scared.forPlayer.documents).toEqual([]);
    expect(scared.forPlayer.deleted).toEqual([]);

    const freed = await t.send(
      t.gm,
      op('actor.removeCondition', { actorId, slug: 'frightened' }),
    );
    expect(freed.forGm.documents[0]).toMatchObject({ system: { conditions: [] } });
    expect(freed.forPlayer.documents).toEqual([]);

    expect(
      (
        await emitOperation(
          t.player,
          op('actor.addCondition', { actorId, slug: 'prone' }),
        )
      ).ok,
    ).toBe(false);
  });

  it('refuses a player rolling for a monster, and one strike named two ways', async () => {
    const t = await table();
    const made = await t.send(t.gm, op('actor.createFromCreature', strangler));
    const actorId = made.forGm.documents[0]?.id ?? '';

    expect(
      (
        await emitOperation(
          t.player,
          op('actor.rollStrike', { actorId, strikeKey: 'strike:vine', attackNumber: 1 }),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await emitOperation(
          t.gm,
          op('actor.rollStrike', {
            actorId,
            strikeKey: 'strike:vine',
            itemId: crypto.randomUUID(),
            attackNumber: 1,
          }),
        )
      ).ok,
    ).toBe(false);
    expect(store.listDocuments('chatMessage')).toEqual([]);
  });
});

describe('token.drag (the live preview)', () => {
  const op = (type: string, payload: unknown) => ({
    id: crypto.randomUUID(),
    type,
    payload,
  });

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  function nextBroadcast(socket: ClientSocket): Promise<Broadcast> {
    return new Promise((resolve) => {
      socket.once('broadcast', resolve);
    });
  }

  /** Every `token.drag` this socket is sent from now on. */
  function listen(socket: ClientSocket): TokenDrag[] {
    const heard: TokenDrag[] = [];
    socket.on('token.drag', (drag: TokenDrag) => {
      heard.push(drag);
    });
    return heard;
  }

  /** The GM, a player who owns a character in the party, and a second player who can see the table but owns nothing. */
  async function table() {
    store.putSeat(makeSeat({ name: 'GM', isGM: true, claimedByDeviceToken: 'gm' }));
    store.putSeat(makeSeat({ name: 'Owner', claimedByDeviceToken: 'owner' }));
    store.putSeat(makeSeat({ name: 'Watcher', claimedByDeviceToken: 'watcher' }));
    const sockets = {
      gm: await connect('gm'),
      owner: await connect('owner'),
      watcher: await connect('watcher'),
    };
    const everyone = Object.values(sockets);
    const send = async (from: ClientSocket, operation: ReturnType<typeof op>) => {
      const heard = everyone.map(nextBroadcast);
      expect(await emitOperation(from, operation)).toEqual({ ok: true });
      return (await Promise.all(heard))[0] as Broadcast;
    };

    const made = await send(
      sockets.owner,
      op('actor.create', { kind: 'character', name: 'Hero' }),
    );
    const heroId = made.documents[0]?.id ?? '';
    await send(sockets.gm, op('party.addMember', { actorId: heroId }));
    const crypt = await send(
      sockets.gm,
      op('scene.create', { name: 'Crypt', kind: 'battle' }),
    );
    const sceneId = crypt.documents[0]?.id ?? '';
    const entered = await send(sockets.gm, op('scene.activate', { sceneId }));
    const heroToken = entered.documents.find((d) => d.type === 'token');
    if (heroToken === undefined) {
      throw new Error('expected the hero to have a token');
    }
    return { ...sockets, send, heroId, sceneId, heroToken };
  }

  it('shows an owner’s drag to everyone else who can see the token, and not back to them', async () => {
    const t = await table();
    const gmHeard = listen(t.gm);
    const watcherHeard = listen(t.watcher);
    const ownerHeard = listen(t.owner);

    t.owner.emit('token.drag', { tokenId: heroTokenId(t), x: 712.5, y: 833.25 });
    await wait(100);

    expect(gmHeard).toEqual([{ tokenId: heroTokenId(t), x: 712.5, y: 833.25 }]);
    expect(watcherHeard).toEqual(gmHeard);
    expect(ownerHeard).toEqual([]);
  });

  it('is never stored or sequenced: no operation is logged and the token does not move', async () => {
    const t = await table();
    const before = store.listOperationsSince(0).length;
    const start = store.getDocument(heroTokenId(t));

    t.owner.emit('token.drag', { tokenId: heroTokenId(t), x: 900, y: 900 });
    await wait(100);

    expect(store.listOperationsSince(0)).toHaveLength(before);
    expect(store.getDocument(heroTokenId(t))).toEqual(start);
  });

  it('keeps a drag of a token the GM has hidden from every player', async () => {
    const t = await table();
    await t.send(
      t.gm,
      op('token.update', { tokenId: heroTokenId(t), changes: { hidden: true } }),
    );
    expect(store.getDocument(heroTokenId(t))).toMatchObject({ hidden: true });
    const ownerHeard = listen(t.owner);
    const watcherHeard = listen(t.watcher);

    t.gm.emit('token.drag', { tokenId: heroTokenId(t), x: 500, y: 500 });
    await wait(100);

    expect(ownerHeard).toEqual([]);
    expect(watcherHeard).toEqual([]);
  });

  it('drops a drag by someone who does not own the token’s actor', async () => {
    const t = await table();
    const gmHeard = listen(t.gm);
    const ownerHeard = listen(t.owner);

    t.watcher.emit('token.drag', { tokenId: heroTokenId(t), x: 500, y: 500 });
    await wait(100);

    expect(gmHeard).toEqual([]);
    expect(ownerHeard).toEqual([]);
  });

  it('keeps a drag on the scene, and drops malformed ones without harm', async () => {
    const t = await table();
    const gmHeard = listen(t.gm);

    t.owner.emit('token.drag', 'not a drag');
    await wait(60);
    t.owner.emit('token.drag', { tokenId: heroTokenId(t), x: 30000, y: 30000 });
    await wait(100);

    expect(gmHeard).toEqual([{ tokenId: heroTokenId(t), x: 2000, y: 2000 }]);
  });

  it('rate-limits a flood from one connection, but still lets the first through', async () => {
    const t = await table();
    const gmHeard = listen(t.gm);

    for (let i = 0; i < 60; i += 1) {
      t.owner.emit('token.drag', { tokenId: heroTokenId(t), x: 100 + i, y: 100 });
    }
    await wait(200);

    expect(gmHeard.length).toBeGreaterThanOrEqual(1);
    expect(gmHeard.length).toBeLessThanOrEqual(4);
    expect(gmHeard[0]).toMatchObject({ x: 100 });
  });

  it('lets the settled move through as the real operation after a drag', async () => {
    const t = await table();
    t.owner.emit('token.drag', { tokenId: heroTokenId(t), x: 700, y: 800 });
    await wait(60);

    const moved = await t.send(
      t.owner,
      op('token.move', { tokenId: heroTokenId(t), x: 710, y: 820 }),
    );

    expect(moved.documents[0]).toMatchObject({ x: 750, y: 850 });
    expect(store.getDocument(heroTokenId(t))).toMatchObject({ x: 750, y: 850 });
  });

  function heroTokenId(t: { heroToken: { id: string } }): string {
    return t.heroToken.id;
  }
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
