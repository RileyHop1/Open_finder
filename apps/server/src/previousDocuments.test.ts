import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BaseDocument } from '@hearthtable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recordPreviousDocuments } from './previousDocuments.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-previous-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-01T00:00:00.000Z';

function makeDocument(
  default_: BaseDocument['permissions']['default'],
  id: string = crypto.randomUUID(),
): BaseDocument {
  return {
    id,
    worldId: store.world.id,
    type: 'token',
    schemaVersion: 1,
    permissions: { default: default_, seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('recordPreviousDocuments', () => {
  it('records the stored state of a document before it is overwritten', () => {
    const original = makeDocument('observer');
    store.putDocument(original);
    const previous = new Map<string, BaseDocument>();

    recordPreviousDocuments(store, previous).putDocument({
      ...original,
      permissions: { default: 'none', seats: {} },
    });

    expect(previous.get(original.id)?.permissions.default).toBe('observer');
    // The write itself still happened.
    expect(store.getDocument(original.id)).toMatchObject({
      permissions: { default: 'none' },
    });
  });

  it('records nothing for a document the operation creates', () => {
    const previous = new Map<string, BaseDocument>();
    const created = makeDocument('observer');

    recordPreviousDocuments(store, previous).putDocument(created);

    expect(previous.size).toBe(0);
    expect(store.getDocument(created.id)).toBeDefined();
  });

  it('keeps the original, not an intermediate write, when a document is written twice', () => {
    const original = makeDocument('observer');
    store.putDocument(original);
    const previous = new Map<string, BaseDocument>();
    const recording = recordPreviousDocuments(store, previous);

    recording.putDocument({
      ...original,
      permissions: { default: 'limited', seats: {} },
    });
    recording.putDocument({ ...original, permissions: { default: 'none', seats: {} } });

    expect(previous.get(original.id)?.permissions.default).toBe('observer');
  });

  it('does not mistake a created document for an original when it is written again', () => {
    const previous = new Map<string, BaseDocument>();
    const recording = recordPreviousDocuments(store, previous);
    const created = makeDocument('observer');

    recording.putDocument(created);
    recording.putDocument({ ...created, permissions: { default: 'none', seats: {} } });

    expect(previous.size).toBe(0);
  });

  it('records each document it touches separately', () => {
    const a = makeDocument('observer');
    const b = makeDocument('owner');
    store.putDocument(a);
    store.putDocument(b);
    const previous = new Map<string, BaseDocument>();
    const recording = recordPreviousDocuments(store, previous);

    recording.putDocument({ ...a, permissions: { default: 'none', seats: {} } });
    recording.putDocument({ ...b, permissions: { default: 'none', seats: {} } });

    expect([...previous.keys()].sort()).toEqual([a.id, b.id].sort());
    expect(previous.get(b.id)?.permissions.default).toBe('owner');
  });

  it('stores only the envelope, never the type-specific fields', () => {
    const original = { ...makeDocument('observer'), secret: 'hp 40' };
    store.putDocument(original);
    const previous = new Map<string, BaseDocument>();

    recordPreviousDocuments(store, previous).putDocument(
      makeDocument('none', original.id),
    );

    expect(previous.get(original.id)).not.toHaveProperty('secret');
  });

  it('leaves every other store method working, including the transaction', () => {
    const recording = recordPreviousDocuments(store, new Map());
    const doc = makeDocument('observer');

    recording.transaction(() => recording.putDocument(doc));

    expect(recording.world).toBe(store.world);
    expect(recording.getDocument(doc.id)).toBeDefined();
    expect(recording.listDocuments('token')).toHaveLength(1);
    expect(recording.deleteDocument(doc.id)).toBe(true);
  });
});
