import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BaseDocument, Seat } from '@hearthtable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveWorldPaths } from './paths.js';
import {
  type NewOperation,
  type WorldStore,
  createWorld,
  listWorldIds,
  openWorld,
} from './worldStore.js';

let worldsRoot: string;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-worldstore-test-'));
});

afterEach(() => {
  rmSync(worldsRoot, { recursive: true, force: true });
});

function makeDocument(
  worldId: string,
  overrides: Partial<BaseDocument> = {},
): BaseDocument {
  return {
    id: crypto.randomUUID(),
    worldId,
    type: 'party',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeOperation(
  worldId: string,
  overrides: Partial<NewOperation> = {},
): NewOperation {
  return {
    id: crypto.randomUUID(),
    worldId,
    type: 'chat.sendMessage',
    payload: { text: 'hi' },
    appliedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSeat(worldId: string, overrides: Partial<Seat> = {}): Seat {
  return {
    id: crypto.randomUUID(),
    worldId,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('createWorld', () => {
  it('creates the folder structure from CLAUDE.md exactly', () => {
    const store = createWorld(worldsRoot, 'Curse of the Crimson Throne');
    const paths = resolveWorldPaths(worldsRoot, store.world.id);

    expect(existsSync(paths.manifestFile)).toBe(true);
    expect(existsSync(paths.databaseFile)).toBe(true);
    expect(existsSync(paths.assetsDir)).toBe(true);
    expect(existsSync(paths.snapshotsDir)).toBe(true);

    store.close();
  });

  it('returns a store whose world matches worldSchema', () => {
    const store = createWorld(worldsRoot, 'Test Campaign');
    expect(store.world.name).toBe('Test Campaign');
    expect(store.world.schemaVersion).toBe(1);
    store.close();
  });
});

describe('openWorld', () => {
  it('re-opens a world created by createWorld with the same identity', () => {
    const created = createWorld(worldsRoot, 'Test Campaign');
    created.close();

    const reopened = openWorld(worldsRoot, created.world.id);
    expect(reopened.world).toEqual(created.world);
    reopened.close();
  });

  it('throws for a world id that does not exist', () => {
    expect(() => openWorld(worldsRoot, crypto.randomUUID())).toThrow();
  });

  it('persists documents written before close', () => {
    const created = createWorld(worldsRoot, 'Test Campaign');
    const doc = makeDocument(created.world.id);
    created.putDocument(doc);
    created.close();

    const reopened = openWorld(worldsRoot, created.world.id);
    expect(reopened.getDocument(doc.id)).toEqual(doc);
    reopened.close();
  });
});

describe('listWorldIds', () => {
  it('is empty for a worldsRoot that does not exist yet', () => {
    expect(listWorldIds(join(worldsRoot, 'does-not-exist'))).toEqual([]);
  });

  it('lists every created world', () => {
    const a = createWorld(worldsRoot, 'World A');
    const b = createWorld(worldsRoot, 'World B');
    a.close();
    b.close();

    expect(listWorldIds(worldsRoot).sort()).toEqual([a.world.id, b.world.id].sort());
  });

  it('ignores a stray directory with no world.json', () => {
    const store = createWorld(worldsRoot, 'Real World');
    store.close();
    mkdtempSync(join(worldsRoot, 'not-a-world-'));

    expect(listWorldIds(worldsRoot)).toEqual([store.world.id]);
  });
});

describe('documents', () => {
  let store: WorldStore;

  beforeEach(() => {
    store = createWorld(worldsRoot, 'Test Campaign');
  });

  afterEach(() => {
    store.close();
  });

  it('round-trips a document exactly', () => {
    const doc = makeDocument(store.world.id, { type: 'party' });
    store.putDocument(doc);
    expect(store.getDocument(doc.id)).toEqual(doc);
  });

  it('returns undefined for an id that was never written', () => {
    expect(store.getDocument(crypto.randomUUID())).toBeUndefined();
  });

  it('upserts on a second write with the same id', () => {
    const doc = makeDocument(store.world.id);
    store.putDocument(doc);
    const updated: BaseDocument = {
      ...doc,
      type: 'party',
      permissions: { default: 'owner', seats: {} },
    };
    store.putDocument(updated);

    expect(store.getDocument(doc.id)).toEqual(updated);
    expect(store.listDocuments()).toHaveLength(1); // an update, not a second row
  });

  it('lists all documents in the world when no type filter is given', () => {
    store.putDocument(makeDocument(store.world.id, { type: 'party' }));
    store.putDocument(makeDocument(store.world.id, { type: 'journalEntry' }));
    expect(store.listDocuments()).toHaveLength(2);
  });

  it('filters by type', () => {
    store.putDocument(makeDocument(store.world.id, { type: 'party' }));
    store.putDocument(makeDocument(store.world.id, { type: 'journalEntry' }));
    const parties = store.listDocuments('party') as BaseDocument[];
    expect(parties).toHaveLength(1);
    expect(parties[0]?.type).toBe('party');
  });

  it('orders by createdAt ascending, not insertion order -- a chat log must read oldest first', () => {
    const newer = makeDocument(store.world.id, { createdAt: '2024-01-02T00:00:00.000Z' });
    const older = makeDocument(store.world.id, { createdAt: '2024-01-01T00:00:00.000Z' });
    // Written newer-first specifically so insertion order and createdAt order disagree.
    store.putDocument(newer);
    store.putDocument(older);

    const documents = store.listDocuments() as BaseDocument[];
    expect(documents.map((doc) => doc.id)).toEqual([older.id, newer.id]);
  });
});

describe('operations', () => {
  let store: WorldStore;

  beforeEach(() => {
    store = createWorld(worldsRoot, 'Test Campaign');
  });

  afterEach(() => {
    store.close();
  });

  it('assigns increasing sequence numbers, starting at 1', () => {
    const first = store.appendOperation(makeOperation(store.world.id));
    const second = store.appendOperation(makeOperation(store.world.id));
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
  });

  it('round-trips an operation with no seatId as genuinely absent, not null or undefined-valued', () => {
    const applied = store.appendOperation(makeOperation(store.world.id));
    expect(Object.hasOwn(applied, 'seatId')).toBe(false);

    const [replayed] = store.listOperationsSince(0);
    expect(replayed).toBeDefined();
    expect(Object.hasOwn(replayed as object, 'seatId')).toBe(false);
  });

  it('round-trips an operation with a seatId', () => {
    const seatId = crypto.randomUUID();
    store.appendOperation(makeOperation(store.world.id, { seatId }));
    const [replayed] = store.listOperationsSince(0);
    expect(replayed?.seatId).toBe(seatId);
  });

  it('listOperationsSince returns only operations after the given sequence, in order', () => {
    const first = store.appendOperation(makeOperation(store.world.id));
    const second = store.appendOperation(makeOperation(store.world.id));
    const third = store.appendOperation(makeOperation(store.world.id));

    const replayed = store.listOperationsSince(first.sequence);
    expect(replayed.map((op) => op.sequence)).toEqual([second.sequence, third.sequence]);
  });

  it('listOperationsSince(0) returns everything', () => {
    store.appendOperation(makeOperation(store.world.id));
    store.appendOperation(makeOperation(store.world.id));
    expect(store.listOperationsSince(0)).toHaveLength(2);
  });
});

describe('meta', () => {
  let store: WorldStore;

  beforeEach(() => {
    store = createWorld(worldsRoot, 'Test Campaign');
  });

  afterEach(() => {
    store.close();
  });

  // 'schemaVersion' is a reserved key the migration runner owns (see
  // migrations.ts) -- these use an arbitrary key the store itself has no
  // opinion about, so they test getMeta/setMeta in isolation from that.
  it('returns undefined for a key never set', () => {
    expect(store.getMeta('exampleKey')).toBeUndefined();
  });

  it('round-trips a value', () => {
    store.setMeta('exampleKey', 'a');
    expect(store.getMeta('exampleKey')).toBe('a');
  });

  it('upserts on a second set with the same key', () => {
    store.setMeta('exampleKey', 'a');
    store.setMeta('exampleKey', 'b');
    expect(store.getMeta('exampleKey')).toBe('b');
  });
});

describe('transaction', () => {
  let store: WorldStore;

  beforeEach(() => {
    store = createWorld(worldsRoot, 'Test Campaign');
  });

  afterEach(() => {
    store.close();
  });

  it('commits everything written inside on success', () => {
    const doc = makeDocument(store.world.id);
    store.transaction(() => {
      store.putDocument(doc);
      store.appendOperation(makeOperation(store.world.id));
    });

    expect(store.getDocument(doc.id)).toEqual(doc);
    expect(store.listOperationsSince(0)).toHaveLength(1);
  });

  it('rolls back everything written inside when the function throws', () => {
    const doc = makeDocument(store.world.id);

    expect(() =>
      store.transaction(() => {
        store.putDocument(doc);
        store.appendOperation(makeOperation(store.world.id));
        throw new Error('simulated failure mid-transaction');
      }),
    ).toThrow('simulated failure mid-transaction');

    // Neither write should have survived the rollback.
    expect(store.getDocument(doc.id)).toBeUndefined();
    expect(store.listOperationsSince(0)).toHaveLength(0);
  });

  it('propagates the return value on success', () => {
    const result = store.transaction(() => 42);
    expect(result).toBe(42);
  });
});

describe('seats', () => {
  let store: WorldStore;

  beforeEach(() => {
    store = createWorld(worldsRoot, 'Test Campaign');
  });

  afterEach(() => {
    store.close();
  });

  it('round-trips a seat exactly', () => {
    const seat = makeSeat(store.world.id);
    store.putSeat(seat);
    expect(store.getSeat(seat.id)).toEqual(seat);
  });

  it('returns undefined for an id that was never written', () => {
    expect(store.getSeat(crypto.randomUUID())).toBeUndefined();
  });

  it('round-trips a GM seat with a pin', () => {
    const seat = makeSeat(store.world.id, { isGM: true, pin: '4242' });
    store.putSeat(seat);
    expect(store.getSeat(seat.id)).toEqual(seat);
  });

  it('round-trips a claimed seat with a device token', () => {
    const seat = makeSeat(store.world.id, { claimedByDeviceToken: crypto.randomUUID() });
    store.putSeat(seat);
    expect(store.getSeat(seat.id)).toEqual(seat);
  });

  it('omits pin and claimedByDeviceToken entirely when unset, not as null', () => {
    const seat = makeSeat(store.world.id);
    store.putSeat(seat);
    const retrieved = store.getSeat(seat.id);
    expect(retrieved).toBeDefined();
    expect(Object.hasOwn(retrieved as object, 'pin')).toBe(false);
    expect(Object.hasOwn(retrieved as object, 'claimedByDeviceToken')).toBe(false);
  });

  it('upserts on a second write with the same id', () => {
    const seat = makeSeat(store.world.id, { name: 'Valeros' });
    store.putSeat(seat);
    const renamed = { ...seat, name: 'Seelah' };
    store.putSeat(renamed);

    expect(store.getSeat(seat.id)?.name).toBe('Seelah');
    expect(store.listSeats()).toHaveLength(1); // an update, not a second row
  });

  it('lists every seat in the world', () => {
    store.putSeat(makeSeat(store.world.id, { name: 'A' }));
    store.putSeat(makeSeat(store.world.id, { name: 'B' }));
    expect(store.listSeats()).toHaveLength(2);
  });

  it('finds a seat by its claimed device token', () => {
    const token = crypto.randomUUID();
    const seat = makeSeat(store.world.id, { claimedByDeviceToken: token });
    store.putSeat(seat);
    store.putSeat(makeSeat(store.world.id)); // an unrelated, unclaimed seat

    expect(store.getSeatByDeviceToken(token)?.id).toBe(seat.id);
  });

  it('returns undefined when no seat is claimed by that device token', () => {
    store.putSeat(makeSeat(store.world.id));
    expect(store.getSeatByDeviceToken(crypto.randomUUID())).toBeUndefined();
  });

  it('persists seats across a close/reopen', () => {
    const seat = makeSeat(store.world.id);
    store.putSeat(seat);
    store.close();

    // Reassign `store` so the describe block's afterEach closes the reopened
    // handle, not the one already closed above (node:sqlite throws on a
    // second close of the same database).
    store = openWorld(worldsRoot, seat.worldId);
    expect(store.getSeat(seat.id)).toEqual(seat);
  });
});

describe('serialize', () => {
  it('produces bytes another world can be restored from', () => {
    const store = createWorld(worldsRoot, 'Serialize Test');
    const seat = makeSeat(store.world.id);
    store.putSeat(seat);
    const bytes = store.serialize();
    store.close();

    const restoredRoot = mkdtempSync(join(tmpdir(), 'hearthtable-worldstore-restored-'));
    try {
      const restoredPaths = resolveWorldPaths(restoredRoot, store.world.id);
      mkdirSync(restoredPaths.root, { recursive: true });
      writeFileSync(restoredPaths.manifestFile, JSON.stringify(store.world, null, 2));
      writeFileSync(restoredPaths.databaseFile, bytes);

      const restored = openWorld(restoredRoot, store.world.id);
      expect(restored.getSeat(seat.id)).toEqual(seat);
      restored.close();
    } finally {
      rmSync(restoredRoot, { recursive: true, force: true });
    }
  });
});
