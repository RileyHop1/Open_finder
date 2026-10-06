import { describe, expect, it } from 'vitest';

import { clientOperationUnionSchema } from './operation.js';

const op = (type: string, payload: unknown) =>
  clientOperationUnionSchema.safeParse({ id: crypto.randomUUID(), type, payload });

const actorHolder = () => ({ kind: 'actor' as const, actorId: crypto.randomUUID() });
const partyHolder = { kind: 'party' as const };

describe('inventory.transfer', () => {
  it('accepts an item move between an actor and the party', () => {
    expect(
      op('inventory.transfer', {
        from: actorHolder(),
        to: partyHolder,
        item: { itemId: crypto.randomUUID() },
      }).success,
    ).toBe(true);
    expect(
      op('inventory.transfer', {
        from: partyHolder,
        to: actorHolder(),
        item: { itemId: crypto.randomUUID(), quantity: 3 },
      }).success,
    ).toBe(true);
  });

  it('accepts a coins move between two actors', () => {
    expect(
      op('inventory.transfer', {
        from: actorHolder(),
        to: actorHolder(),
        coins: { gp: 5, sp: 3 },
      }).success,
    ).toBe(true);
    expect(
      op('inventory.transfer', {
        from: actorHolder(),
        to: actorHolder(),
        coins: {},
      }).success,
    ).toBe(true);
  });

  it('rejects naming both item and coins, or neither', () => {
    const from = actorHolder();
    const to = actorHolder();
    expect(
      op('inventory.transfer', {
        from,
        to,
        item: { itemId: crypto.randomUUID() },
        coins: { gp: 1 },
      }).success,
    ).toBe(false);
    expect(op('inventory.transfer', { from, to }).success).toBe(false);
  });

  it('rejects from and to being the same holder', () => {
    const actor = actorHolder();
    expect(
      op('inventory.transfer', {
        from: actor,
        to: { ...actor },
        item: { itemId: crypto.randomUUID() },
      }).success,
    ).toBe(false);
    expect(
      op('inventory.transfer', {
        from: partyHolder,
        to: partyHolder,
        coins: { gp: 1 },
      }).success,
    ).toBe(false);
  });

  it('rejects a negative coin amount and a non-positive quantity', () => {
    const from = actorHolder();
    const to = actorHolder();
    expect(op('inventory.transfer', { from, to, coins: { gp: -1 } }).success).toBe(false);
    expect(
      op('inventory.transfer', {
        from,
        to,
        item: { itemId: crypto.randomUUID(), quantity: 0 },
      }).success,
    ).toBe(false);
  });
});
