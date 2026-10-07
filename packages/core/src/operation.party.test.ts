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

describe('party.addItem and actor.addItem quantity', () => {
  it('party.addItem names an entry, with an optional stack size', () => {
    expect(op('party.addItem', { packId: 'equipment', slug: 'rope' }).success).toBe(true);
    expect(
      op('party.addItem', { packId: 'equipment', slug: 'rope', quantity: 5 }).success,
    ).toBe(true);
  });

  it('party.addItem rejects a missing entry, and a bad or oversize quantity', () => {
    expect(op('party.addItem', { packId: 'equipment' }).success).toBe(false);
    for (const quantity of [0, -1, 1.5, 10_000]) {
      expect(
        op('party.addItem', { packId: 'equipment', slug: 'rope', quantity }).success,
      ).toBe(false);
    }
  });

  it('actor.addItem takes the same optional quantity', () => {
    const base = { actorId: crypto.randomUUID(), packId: 'equipment', slug: 'rope' };
    expect(op('actor.addItem', { ...base, quantity: 3 }).success).toBe(true);
    expect(op('actor.addItem', base).success).toBe(true);
    expect(op('actor.addItem', { ...base, quantity: 0 }).success).toBe(false);
  });
});
