import type { AppliedOperation, BaseDocument, Broadcast, Seat } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { broadcastFor, operationsFor, readableDocuments } from './visibility.js';

const worldId = crypto.randomUUID();

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDocument(
  level: BaseDocument['permissions']['default'],
  seats: BaseDocument['permissions']['seats'] = {},
): BaseDocument {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: level, seats },
    createdAt: now,
    updatedAt: now,
  };
}

function makeOperation(type: string, payload: unknown): AppliedOperation {
  return {
    id: crypto.randomUUID(),
    worldId,
    type,
    payload,
    sequence: 7,
    appliedAt: new Date().toISOString(),
  };
}

function makeBroadcast(
  documents: BaseDocument[],
  payload: unknown = { secret: 1 },
  deleted: BaseDocument[] = [],
): Broadcast {
  return {
    sequence: 7,
    operation: makeOperation('actor.update', payload),
    documents,
    deleted,
    seats: [],
  };
}

const gm = makeSeat({ isGM: true, name: 'GM' });
const player = makeSeat();

describe('broadcastFor', () => {
  it('returns the broadcast untouched when the viewer can read every document', () => {
    const broadcast = makeBroadcast([makeDocument('observer')]);
    expect(broadcastFor(player, broadcast)).toBe(broadcast);
  });

  it('drops a document the viewer cannot read and withholds the operation payload', () => {
    const hidden = makeDocument('none');
    const shown = makeDocument('observer');
    const result = broadcastFor(player, makeBroadcast([hidden, shown]));
    expect(result.documents.map((d) => d.id)).toEqual([shown.id]);
    expect(result.operation.payload).toEqual({});
  });

  it('keeps the sequence number and the operation identity, so there is no gap', () => {
    const broadcast = makeBroadcast([makeDocument('none')]);
    const result = broadcastFor(player, broadcast);
    expect(result.sequence).toBe(7);
    expect(result.operation.id).toBe(broadcast.operation.id);
    expect(result.operation.type).toBe('actor.update');
    expect(result.documents).toEqual([]);
  });

  it('shows the GM everything, payload included', () => {
    const broadcast = makeBroadcast([makeDocument('none')]);
    const result = broadcastFor(gm, broadcast);
    expect(result.documents).toHaveLength(1);
    expect(result.operation.payload).toEqual({ secret: 1 });
  });

  it('honors a per-seat override', () => {
    const doc = makeDocument('none', { [player.id]: 'observer' });
    expect(broadcastFor(player, makeBroadcast([doc])).documents).toHaveLength(1);
    expect(broadcastFor(makeSeat(), makeBroadcast([doc])).documents).toHaveLength(0);
  });

  it('judges a viewer with no seat by the document default', () => {
    const visible = makeBroadcast([makeDocument('observer')]);
    const hidden = makeBroadcast([makeDocument('none')]);
    expect(broadcastFor(undefined, visible).documents).toHaveLength(1);
    expect(broadcastFor(undefined, hidden).documents).toHaveLength(0);
  });

  it('leaves a broadcast with no documents alone, even for a viewer with no seat', () => {
    const broadcast = makeBroadcast([]);
    expect(broadcastFor(undefined, broadcast)).toBe(broadcast);
  });
});

describe('broadcastFor -- deletions', () => {
  it('tells a viewer about the deletion of a document they could read', () => {
    const gone = makeDocument('observer');
    const broadcast = makeBroadcast([], { actorId: gone.id }, [gone]);
    const result = broadcastFor(player, broadcast);
    expect(result.deleted.map((d) => d.id)).toEqual([gone.id]);
    expect(result.operation.payload).toEqual({ actorId: gone.id });
  });

  it('hides the deletion of a document the viewer could not read, and withholds the payload', () => {
    const gone = makeDocument('none');
    const result = broadcastFor(player, makeBroadcast([], { actorId: gone.id }, [gone]));
    expect(result.deleted).toEqual([]);
    expect(result.operation.payload).toEqual({});
  });

  it('tells the GM about every deletion', () => {
    const gone = makeDocument('none');
    const result = broadcastFor(gm, makeBroadcast([], { actorId: gone.id }, [gone]));
    expect(result.deleted.map((d) => d.id)).toEqual([gone.id]);
  });
});

describe('operationsFor', () => {
  const operations = [
    makeOperation('chat.sendRoll', { expression: '1d20' }),
    makeOperation('seat.claim', { seatId: 'x' }),
    makeOperation('actor.update', { secret: 1 }),
  ];

  it('gives the GM every payload', () => {
    expect(operationsFor(gm, operations).map((o) => o.payload)).toEqual(
      operations.map((o) => o.payload),
    );
  });

  it('withholds payloads of non-public operations from everyone else', () => {
    for (const viewer of [player, undefined]) {
      expect(operationsFor(viewer, operations).map((o) => o.payload)).toEqual([
        { expression: '1d20' },
        { seatId: 'x' },
        {},
      ]);
    }
  });

  it('never changes an operation other than its payload', () => {
    const [, , redacted] = operationsFor(player, operations);
    expect(redacted).toEqual({ ...operations[2], payload: {} });
  });
});

describe('readableDocuments', () => {
  it('filters stored rows to what the seat may read', () => {
    const shown = makeDocument('observer');
    const hidden = makeDocument('none');
    expect(readableDocuments(player, [shown, hidden])).toEqual([shown]);
    expect(readableDocuments(gm, [shown, hidden])).toEqual([shown, hidden]);
  });

  it('drops a row that is not a document envelope, for everyone', () => {
    expect(readableDocuments(gm, [{ nonsense: true }, 'text', null])).toEqual([]);
  });
});
