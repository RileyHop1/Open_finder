import { describe, expect, it } from 'vitest';

import {
  actorCreateOperationSchema,
  actorDeleteOperationSchema,
  broadcastSchema,
  clientOperationUnionSchema,
} from './operation.js';

const id = () => crypto.randomUUID();

describe('actor.create', () => {
  it('accepts a kind and a name through the union', () => {
    const result = clientOperationUnionSchema.safeParse({
      id: id(),
      type: 'actor.create',
      payload: { kind: 'character', name: 'Invented Hero' },
    });
    expect(result.success).toBe(true);
  });

  it('trims the name', () => {
    const parsed = actorCreateOperationSchema.parse({
      id: id(),
      type: 'actor.create',
      payload: { kind: 'npc', name: '  Innkeeper  ' },
    });
    expect(parsed.payload.name).toBe('Innkeeper');
  });

  it('rejects a blank or overlong name and an unknown kind', () => {
    const base = { id: id(), type: 'actor.create' };
    for (const payload of [
      { kind: 'character', name: '   ' },
      { kind: 'character', name: 'x'.repeat(101) },
      { kind: 'vehicle', name: 'Cart' },
      { name: 'No kind' },
    ]) {
      expect(actorCreateOperationSchema.safeParse({ ...base, payload }).success).toBe(
        false,
      );
    }
  });

  it('drops a system payload a client tries to smuggle in', () => {
    const parsed = actorCreateOperationSchema.parse({
      id: id(),
      type: 'actor.create',
      payload: { kind: 'character', name: 'Hero', system: { level: 20 } },
    });
    expect(parsed.payload).toEqual({ kind: 'character', name: 'Hero' });
  });
});

describe('actor.delete', () => {
  it('accepts an actor id and rejects a malformed one', () => {
    expect(
      actorDeleteOperationSchema.safeParse({
        id: id(),
        type: 'actor.delete',
        payload: { actorId: id() },
      }).success,
    ).toBe(true);
    expect(
      actorDeleteOperationSchema.safeParse({
        id: id(),
        type: 'actor.delete',
        payload: { actorId: 'nope' },
      }).success,
    ).toBe(false);
  });
});

describe('broadcastSchema -- deleted', () => {
  const operation = () => ({
    id: id(),
    worldId: id(),
    type: 'actor.delete',
    payload: {},
    sequence: 1,
    appliedAt: new Date().toISOString(),
  });
  const envelope = () => {
    const now = new Date().toISOString();
    return {
      id: id(),
      worldId: id(),
      type: 'actor',
      schemaVersion: 1,
      permissions: { default: 'observer' as const, seats: {} },
      createdAt: now,
      updatedAt: now,
    };
  };

  it('defaults to no deletions, so an older shape still parses', () => {
    const parsed = broadcastSchema.parse({
      sequence: 1,
      operation: operation(),
      documents: [],
      seats: [],
    });
    expect(parsed.deleted).toEqual([]);
  });

  it('keeps only the envelope of a deleted document, never its body', () => {
    const parsed = broadcastSchema.parse({
      sequence: 1,
      operation: operation(),
      documents: [],
      deleted: [{ ...envelope(), system: { secret: true }, name: 'Hidden' }],
      seats: [],
    });
    expect(parsed.deleted).toHaveLength(1);
    expect(parsed.deleted[0]).not.toHaveProperty('system');
    expect(parsed.deleted[0]).not.toHaveProperty('name');
  });
});
