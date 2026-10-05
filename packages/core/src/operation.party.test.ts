import { describe, expect, it } from 'vitest';

import { clientOperationUnionSchema } from './operation.js';

const op = (type: string, payload: unknown) =>
  clientOperationUnionSchema.safeParse({ id: crypto.randomUUID(), type, payload });

describe('party operations', () => {
  const id = crypto.randomUUID();

  it('accepts add, remove, and reorder', () => {
    expect(op('party.addMember', { actorId: id }).success).toBe(true);
    expect(op('party.removeMember', { actorId: id }).success).toBe(true);
    expect(op('party.reorder', { memberIds: [id] }).success).toBe(true);
    expect(op('party.reorder', { memberIds: [] }).success).toBe(true);
  });

  it('rejects a malformed id and a missing field', () => {
    expect(op('party.addMember', { actorId: 'nope' }).success).toBe(false);
    expect(op('party.addMember', {}).success).toBe(false);
    expect(op('party.reorder', { memberIds: ['nope'] }).success).toBe(false);
    expect(op('party.reorder', {}).success).toBe(false);
  });

  it('party.adjustCoins accepts any subset of denominations, positive or negative', () => {
    expect(op('party.adjustCoins', { delta: { gp: 5 } }).success).toBe(true);
    expect(op('party.adjustCoins', { delta: { gp: -5, sp: 3 } }).success).toBe(true);
    expect(op('party.adjustCoins', { delta: {} }).success).toBe(true);
  });

  it('party.adjustCoins rejects a non-integer denomination and a missing delta', () => {
    expect(op('party.adjustCoins', { delta: { gp: 1.5 } }).success).toBe(false);
    expect(op('party.adjustCoins', {}).success).toBe(false);
  });
});
