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

describe('broadcastFor -- taking access away', () => {
  /** The document as it was before, and as the operation leaves it: same id, new permissions. */
  function changed(
    before: BaseDocument['permissions'],
    after: BaseDocument['permissions'],
  ): { before: BaseDocument; after: BaseDocument } {
    const original = makeDocument('none');
    return {
      before: { ...original, permissions: before },
      after: { ...original, permissions: after },
    };
  }

  const previousOf = (...documents: BaseDocument[]) =>
    new Map(documents.map((document) => [document.id, document]));

  it('tells a viewer who held a document to drop it once it becomes unreadable', () => {
    const { before, after } = changed(
      { default: 'observer', seats: {} },
      { default: 'none', seats: {} },
    );
    const result = broadcastFor(player, makeBroadcast([after]), previousOf(before));
    expect(result.documents).toEqual([]);
    // The tombstone is the envelope as the viewer last saw it, and nothing of the body.
    expect(result.deleted).toEqual([before]);
    expect(result.operation.payload).toEqual({});
  });

  it('says nothing to a viewer who never could read it, so editing a hidden document does not announce it', () => {
    const { before, after } = changed(
      { default: 'none', seats: {} },
      { default: 'none', seats: {} },
    );
    const result = broadcastFor(player, makeBroadcast([after]), previousOf(before));
    expect(result.documents).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  it('says nothing about a document the operation created and the viewer cannot read', () => {
    const created = makeDocument('none');
    const result = broadcastFor(player, makeBroadcast([created]), new Map());
    expect(result.documents).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  it('says nothing when there is no record of the previous state', () => {
    const { after } = changed(
      { default: 'observer', seats: {} },
      { default: 'none', seats: {} },
    );
    expect(broadcastFor(player, makeBroadcast([after])).deleted).toEqual([]);
  });

  it('revokes only the seat whose access went away', () => {
    const { before, after } = changed(
      { default: 'none', seats: { [player.id]: 'observer' } },
      { default: 'none', seats: {} },
    );
    const broadcast = makeBroadcast([after]);
    const previous = previousOf(before);
    expect(broadcastFor(player, broadcast, previous).deleted).toEqual([before]);
    // Another seat never held it, so it hears nothing.
    expect(broadcastFor(makeSeat(), broadcast, previous).deleted).toEqual([]);
  });

  it('revokes for a viewer with no seat, judged by the default', () => {
    const { before, after } = changed(
      { default: 'observer', seats: {} },
      { default: 'none', seats: {} },
    );
    expect(
      broadcastFor(undefined, makeBroadcast([after]), previousOf(before)).deleted,
    ).toEqual([before]);
  });

  it('shows the GM the document as it is, with nothing revoked', () => {
    const { before, after } = changed(
      { default: 'observer', seats: {} },
      { default: 'none', seats: {} },
    );
    const broadcast = makeBroadcast([after]);
    expect(broadcastFor(gm, broadcast, previousOf(before))).toBe(broadcast);
  });

  it('sends a document that becomes readable as the document itself, with no deletion', () => {
    const { before, after } = changed(
      { default: 'none', seats: {} },
      { default: 'observer', seats: {} },
    );
    const broadcast = makeBroadcast([after]);
    expect(broadcastFor(player, broadcast, previousOf(before))).toBe(broadcast);
  });

  it('does not repeat a document that the operation also deleted', () => {
    const { before, after } = changed(
      { default: 'observer', seats: {} },
      { default: 'none', seats: {} },
    );
    const result = broadcastFor(
      player,
      makeBroadcast([after], {}, [before]),
      previousOf(before),
    );
    expect(result.deleted.map((d) => d.id)).toEqual([before.id]);
  });

  it('keeps the readable documents and revokes the unreadable one in the same broadcast', () => {
    const { before, after } = changed(
      { default: 'observer', seats: {} },
      { default: 'none', seats: {} },
    );
    const stays = makeDocument('observer');
    const result = broadcastFor(
      player,
      makeBroadcast([stays, after]),
      previousOf(before),
    );
    expect(result.documents.map((d) => d.id)).toEqual([stays.id]);
    expect(result.deleted.map((d) => d.id)).toEqual([before.id]);
  });
});
