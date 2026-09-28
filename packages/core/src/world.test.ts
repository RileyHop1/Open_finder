import { describe, expect, it } from 'vitest';

import { type World, worldSchema } from './world.js';

function validWorld() {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: 'Curse of the Crimson Throne',
  };
}

describe('worldSchema', () => {
  it('accepts a well-formed world', () => {
    expect(worldSchema.safeParse(validWorld()).success).toBe(true);
  });

  it('has no worldId -- a world cannot belong to itself', () => {
    const parsed = worldSchema.parse(validWorld());
    expect('worldId' in parsed).toBe(false);
  });

  it('has no permissions field -- that is a document concept, not a world one', () => {
    const parsed = worldSchema.parse(validWorld());
    expect('permissions' in parsed).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(worldSchema.safeParse({ ...validWorld(), name: '' }).success).toBe(false);
  });

  it('rejects a non-UUID id', () => {
    expect(worldSchema.safeParse({ ...validWorld(), id: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('shares the same schemaVersion/timestamp conventions as a document', () => {
    expect(worldSchema.safeParse({ ...validWorld(), schemaVersion: 0 }).success).toBe(
      false,
    );
    expect(
      worldSchema.safeParse({ ...validWorld(), createdAt: 'not a date' }).success,
    ).toBe(false);
  });

  it('infers a usable World type', () => {
    const world: World = validWorld();
    expect(world.name).toBe('Curse of the Crimson Throne');
  });
});
