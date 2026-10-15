import { describe, expect, it } from 'vitest';

import { clientOperationUnionSchema } from './operation.js';

const op = (payload: unknown) =>
  clientOperationUnionSchema.safeParse({
    id: crypto.randomUUID(),
    type: 'actor.setSpellcasting',
    payload,
  });

describe('actor.setSpellcasting', () => {
  it('takes an actor and an entry, whose shape the PF2e system checks', () => {
    expect(op({ actorId: crypto.randomUUID(), entry: { anything: 1 } }).success).toBe(
      true,
    );
  });

  it('rejects a missing entry, an entry that is not an object, and a bad actor id', () => {
    expect(op({ actorId: crypto.randomUUID() }).success).toBe(false);
    expect(op({ actorId: crypto.randomUUID(), entry: 'prepared' }).success).toBe(false);
    expect(op({ actorId: 'nope', entry: {} }).success).toBe(false);
  });
});
