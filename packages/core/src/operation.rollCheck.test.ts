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
