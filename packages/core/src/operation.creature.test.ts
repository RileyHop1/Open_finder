import { describe, expect, it } from 'vitest';

import { clientOperationUnionSchema } from './operation.js';

const op = (payload: unknown) =>
  clientOperationUnionSchema.safeParse({
    id: crypto.randomUUID(),
    type: 'actor.createFromCreature',
    payload,
  });

describe('actor.createFromCreature', () => {
  it('accepts a pack and a slug', () => {
    expect(op({ packId: 'bestiary', slug: 'goblin-warrior' }).success).toBe(true);
  });

  it('rejects a missing, empty, or overlong pack or slug', () => {
    expect(op({ packId: 'bestiary' }).success).toBe(false);
    expect(op({ slug: 'goblin-warrior' }).success).toBe(false);
    expect(op({ packId: '', slug: 'x' }).success).toBe(false);
    expect(op({ packId: 'bestiary', slug: '' }).success).toBe(false);
    expect(op({ packId: 'x'.repeat(101), slug: 'x' }).success).toBe(false);
    expect(op({ packId: 'bestiary', slug: 'x'.repeat(201) }).success).toBe(false);
  });

  it('keeps only the entry name, so a client cannot supply a monster’s stats or who sees it', () => {
    const parsed = op({
      packId: 'bestiary',
      slug: 'goblin-warrior',
      system: { hp: 9999 },
      permissions: { default: 'owner' },
      name: 'Hero',
    });
    expect(parsed.success && parsed.data.payload).toEqual({
      packId: 'bestiary',
      slug: 'goblin-warrior',
    });
  });
});
