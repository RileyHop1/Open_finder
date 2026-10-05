import { describe, expect, it } from 'vitest';

import { partySchema } from './party.js';

function partyFields() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    worldId: crypto.randomUUID(),
    type: 'party' as const,
    permissions: { default: 'observer' as const },
    name: 'The Invented Company',
    memberIds: [crypto.randomUUID(), crypto.randomUUID()],
  };
}

describe('partySchema', () => {
  it('accepts a party and defaults its level to 1', () => {
    const parsed = partySchema.parse(partyFields());
    expect(parsed.level).toBe(1);
  });

  it('has no scene until the GM places the party, then keeps the scene id', () => {
    expect(partySchema.parse(partyFields()).sceneId).toBeUndefined();
    const sceneId = crypto.randomUUID();
    expect(partySchema.parse({ ...partyFields(), sceneId }).sceneId).toBe(sceneId);
    expect(partySchema.safeParse({ ...partyFields(), sceneId: 'nope' }).success).toBe(
      false,
    );
  });

  it('accepts an empty party and keeps member order', () => {
    expect(partySchema.safeParse({ ...partyFields(), memberIds: [] }).success).toBe(true);
    const fields = partyFields();
    expect(partySchema.parse(fields).memberIds).toEqual(fields.memberIds);
  });

  it('rejects a duplicate member, a malformed member id, and an out-of-range level', () => {
    const id = crypto.randomUUID();
    expect(partySchema.safeParse({ ...partyFields(), memberIds: [id, id] }).success).toBe(
      false,
    );
    expect(partySchema.safeParse({ ...partyFields(), memberIds: ['nope'] }).success).toBe(
      false,
    );
    expect(partySchema.safeParse({ ...partyFields(), level: 0 }).success).toBe(false);
    expect(partySchema.safeParse({ ...partyFields(), level: 21 }).success).toBe(false);
  });

  it('leaves stash undefined when absent -- core never looks inside it', () => {
    expect(partySchema.parse(partyFields()).stash).toBeUndefined();
  });

  it('accepts any object as stash, opaque to core the same way an Actor.system is', () => {
    const stash = { coins: { gp: 15 }, items: [] };
    expect(partySchema.parse({ ...partyFields(), stash }).stash).toEqual(stash);
  });
});
