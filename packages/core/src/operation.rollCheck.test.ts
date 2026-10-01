import { describe, expect, it } from 'vitest';

import { clientOperationUnionSchema } from './operation.js';

const op = (type: string, payload: unknown) =>
  clientOperationUnionSchema.safeParse({ id: crypto.randomUUID(), type, payload });

describe('actor.rollCheck', () => {
  const actorId = crypto.randomUUID();

  it('accepts a statistic with or without a DC', () => {
    expect(op('actor.rollCheck', { actorId, statistic: 'skill:athletics' }).success).toBe(
      true,
    );
    expect(op('actor.rollCheck', { actorId, statistic: 'will', dc: 25 }).success).toBe(
      true,
    );
  });

  it('rejects a missing or empty statistic, and a DC that is fractional or out of bounds', () => {
    expect(op('actor.rollCheck', { actorId }).success).toBe(false);
    expect(op('actor.rollCheck', { actorId, statistic: '' }).success).toBe(false);
    for (const dc of [1.5, -1, 100]) {
      expect(op('actor.rollCheck', { actorId, statistic: 'will', dc }).success).toBe(
        false,
      );
    }
  });
});

describe('actor.rollStrike and actor.rollDamage', () => {
  const actorId = crypto.randomUUID();
  const itemId = crypto.randomUUID();

  it('accepts attack numbers 1 to 3, with or without a DC', () => {
    for (const attackNumber of [1, 2, 3]) {
      expect(op('actor.rollStrike', { actorId, itemId, attackNumber }).success).toBe(
        true,
      );
    }
    expect(
      op('actor.rollStrike', { actorId, itemId, attackNumber: 1, dc: 18 }).success,
    ).toBe(true);
  });

  it('rejects attack number 0, 4, or a fraction, and a missing item', () => {
    for (const attackNumber of [0, 4, 1.5]) {
      expect(op('actor.rollStrike', { actorId, itemId, attackNumber }).success).toBe(
        false,
      );
    }
    expect(op('actor.rollStrike', { actorId, attackNumber: 1 }).success).toBe(false);
  });

  it('requires critical to be stated on a damage roll', () => {
    expect(op('actor.rollDamage', { actorId, itemId, critical: true }).success).toBe(
      true,
    );
    expect(op('actor.rollDamage', { actorId, itemId, critical: false }).success).toBe(
      true,
    );
    expect(op('actor.rollDamage', { actorId, itemId }).success).toBe(false);
  });

  it('names a monster’s strike by key, and wants exactly one of key and item', () => {
    const strikeKey = 'strike:vine';
    expect(op('actor.rollStrike', { actorId, strikeKey, attackNumber: 2 }).success).toBe(
      true,
    );
    expect(op('actor.rollDamage', { actorId, strikeKey, critical: true }).success).toBe(
      true,
    );
    expect(
      op('actor.rollStrike', { actorId, itemId, strikeKey, attackNumber: 1 }).success,
    ).toBe(false);
    expect(
      op('actor.rollDamage', { actorId, itemId, strikeKey, critical: false }).success,
    ).toBe(false);
    expect(
      op('actor.rollStrike', { actorId, strikeKey: '', attackNumber: 1 }).success,
    ).toBe(false);
  });
});
