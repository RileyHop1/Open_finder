import { describe, expect, it } from 'vitest';

import { clientOperationUnionSchema } from './operation.js';

const op = (type: string, payload: unknown) =>
  clientOperationUnionSchema.safeParse({ id: crypto.randomUUID(), type, payload });

describe('actor.useItem', () => {
  it('accepts an actorId and itemId', () => {
    expect(
      op('actor.useItem', { actorId: crypto.randomUUID(), itemId: crypto.randomUUID() })
        .success,
    ).toBe(true);
  });

  it('rejects a missing itemId or a malformed id', () => {
    expect(op('actor.useItem', { actorId: crypto.randomUUID() }).success).toBe(false);
    expect(
      op('actor.useItem', { actorId: 'nope', itemId: crypto.randomUUID() }).success,
    ).toBe(false);
  });
});
