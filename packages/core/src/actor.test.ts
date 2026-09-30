import { describe, expect, it } from 'vitest';

import { actorSchema } from './actor.js';

function actorFields() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    worldId: crypto.randomUUID(),
    type: 'actor' as const,
    permissions: { default: 'observer' as const },
    kind: 'character' as const,
    name: 'Invented Hero',
    system: { level: 1 },
  };
}

describe('actorSchema', () => {
  it('accepts a well-formed actor and passes the system payload through untouched', () => {
    const parsed = actorSchema.parse({
      ...actorFields(),
      system: { level: 3, deep: { a: 1 } },
    });
    expect(parsed.system).toEqual({ level: 3, deep: { a: 1 } });
  });

  it('treats the portrait as optional', () => {
    expect(actorSchema.safeParse(actorFields()).success).toBe(true);
    expect(
      actorSchema.safeParse({ ...actorFields(), portrait: 'abc123.png' }).success,
    ).toBe(true);
  });

  it.each(['character', 'npc', 'hazard'])('accepts kind %s', (kind) => {
    expect(actorSchema.safeParse({ ...actorFields(), kind }).success).toBe(true);
  });

  it('rejects an unknown kind, an empty name, an empty portrait, and a wrong type', () => {
    expect(actorSchema.safeParse({ ...actorFields(), kind: 'vehicle' }).success).toBe(
      false,
    );
    expect(actorSchema.safeParse({ ...actorFields(), name: '' }).success).toBe(false);
    expect(actorSchema.safeParse({ ...actorFields(), portrait: '' }).success).toBe(false);
    expect(actorSchema.safeParse({ ...actorFields(), type: 'party' }).success).toBe(
      false,
    );
  });

  it('requires the system payload to be an object', () => {
    const { system: _system, ...withoutSystem } = actorFields();
    expect(actorSchema.safeParse(withoutSystem).success).toBe(false);
    expect(actorSchema.safeParse({ ...actorFields(), system: 'nope' }).success).toBe(
      false,
    );
    expect(actorSchema.safeParse({ ...actorFields(), system: [] }).success).toBe(false);
  });
});
