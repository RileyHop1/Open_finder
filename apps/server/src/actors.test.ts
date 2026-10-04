import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema, resolvePermission } from '@hearthtable/core';
import { characterDataSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, deleteActor, updateActor } from './actors.js';
import { OperationRejected } from './rejection.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-actors-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('createActor', () => {
  it('stores an actor the creating seat owns and everyone else can see', () => {
    const seat = makeSeat();
    const actor = createActor(store, seat, { kind: 'character', name: 'Invented Hero' });

    expect(actor.permissions).toEqual({
      default: 'observer',
      seats: { [seat.id]: 'owner' },
    });
    expect(actorSchema.safeParse(store.getDocument(actor.id)).success).toBe(true);
    expect(resolvePermission(seat, actor)).toBe('owner');
    expect(resolvePermission(makeSeat(), actor)).toBe('observer');
  });

  it('gives a character a valid blank sheet, built by the server', () => {
    const actor = createActor(store, makeSeat(), { kind: 'character', name: 'Hero' });
    const system = characterDataSchema.parse(actor.system);
    expect(system.level).toBe(1);
    expect(system.hp).toEqual({ current: 0, temp: 0 });
  });

  it('gives an NPC or hazard an empty system payload for now', () => {
    expect(
      createActor(store, makeSeat(), { kind: 'npc', name: 'Innkeeper' }).system,
    ).toEqual({});
    expect(
      createActor(store, makeSeat(), { kind: 'hazard', name: 'Pit' }).system,
    ).toEqual({});
  });

  it('gives every actor its own id', () => {
    const seat = makeSeat();
    const a = createActor(store, seat, { kind: 'npc', name: 'Goblin' });
    const b = createActor(store, seat, { kind: 'npc', name: 'Goblin' });
    expect(a.id).not.toBe(b.id);
  });

  it('rejects a second character with the same name (ignoring case and whitespace)', () => {
    const seat = makeSeat();
    createActor(store, seat, { kind: 'character', name: 'Valeria' });
    expect(() =>
      createActor(store, seat, { kind: 'character', name: ' valeria ' }),
    ).toThrow(OperationRejected);
  });

  it('allows two NPCs with the same name -- three goblins is a normal table', () => {
    const seat = makeSeat();
    const a = createActor(store, seat, { kind: 'npc', name: 'Goblin' });
    const b = createActor(store, seat, { kind: 'npc', name: 'Goblin' });
    expect(a.id).not.toBe(b.id);
  });

  it('allows a hazard to share a name with a character', () => {
    const seat = makeSeat();
    createActor(store, seat, { kind: 'character', name: 'Pit Trap' });
    expect(() =>
      createActor(store, seat, { kind: 'hazard', name: 'Pit Trap' }),
    ).not.toThrow();
  });
});

describe('updateActor', () => {
  function ownedCharacter() {
    const owner = makeSeat();
    const actor = createActor(store, owner, { kind: 'character', name: 'Hero' });
    return { owner, actor };
  }
  const stored = (id: string) => actorSchema.parse(store.getDocument(id));

  it('rejects a rename that collides with another character', () => {
    const { owner, actor } = ownedCharacter();
    createActor(store, owner, { kind: 'character', name: 'Valeria' });
    expect(() =>
      updateActor(store, owner, { actorId: actor.id, changes: { name: 'Valeria' } }),
    ).toThrow(OperationRejected);
  });

  it('allows a rename that only changes case, since it is still itself', () => {
    const { owner, actor } = ownedCharacter();
    const updated = updateActor(store, owner, {
      actorId: actor.id,
      changes: { name: 'HERO' },
    });
    expect(updated.name).toBe('HERO');
  });

  it('sets the name and nested system fields, and stores the result', () => {
    const { owner, actor } = ownedCharacter();
    const updated = updateActor(store, owner, {
      actorId: actor.id,
      changes: { name: 'Valeria', 'system.attributes.str': 4, 'system.level': 3 },
    });

    expect(updated.name).toBe('Valeria');
    const system = characterDataSchema.parse(stored(actor.id).system);
    expect(system.attributes.str).toBe(4);
    expect(system.level).toBe(3);
    expect(system.attributes.dex).toBe(0);
  });

  it('bumps updatedAt and leaves the id, kind, and permissions alone', () => {
    const { owner, actor } = ownedCharacter();
    const updated = updateActor(store, owner, {
      actorId: actor.id,
      changes: { name: 'Valeria' },
    });
    expect(updated.updatedAt >= actor.updatedAt).toBe(true);
    expect(updated.id).toBe(actor.id);
    expect(updated.kind).toBe('character');
    expect(updated.permissions).toEqual(actor.permissions);
  });

  it('sets a skill rank including a Lore, and null removes it again', () => {
    const { owner, actor } = ownedCharacter();
    updateActor(store, owner, {
      actorId: actor.id,
      changes: {
        'system.ranks.skills.athletics': 'trained',
        'system.ranks.skills.academia-lore': 'expert',
      },
    });
    expect(characterDataSchema.parse(stored(actor.id).system).ranks.skills).toEqual({
      athletics: 'trained',
      'academia-lore': 'expert',
    });

    updateActor(store, owner, {
      actorId: actor.id,
      changes: { 'system.ranks.skills.athletics': null },
    });
    expect(characterDataSchema.parse(stored(actor.id).system).ranks.skills).toEqual({
      'academia-lore': 'expert',
    });
  });

  it('removes an optional field such as the portrait', () => {
    const { owner, actor } = ownedCharacter();
    updateActor(store, owner, { actorId: actor.id, changes: { portrait: 'abc123.png' } });
    expect(stored(actor.id).portrait).toBe('abc123.png');
    updateActor(store, owner, { actorId: actor.id, changes: { portrait: null } });
    expect(stored(actor.id)).not.toHaveProperty('portrait');
  });

  it('rejects a value that would make the sheet invalid, naming the field, and stores nothing', () => {
    const { owner, actor } = ownedCharacter();
    for (const [changes, mention] of [
      [{ 'system.level': 99 }, 'system.level'],
      [{ 'system.ranks.perception': 'supreme' }, 'system.ranks.perception'],
      [{ 'system.attributes.str': 'strong' }, 'system.attributes.str'],
      [{ name: '' }, 'name'],
      [{ name: null }, 'name'],
    ] as const) {
      expect(() => updateActor(store, owner, { actorId: actor.id, changes })).toThrow(
        mention,
      );
    }
    expect(stored(actor.id)).toEqual(actor);
  });

  it('applies a batch atomically: one bad change leaves the others unapplied', () => {
    const { owner, actor } = ownedCharacter();
    expect(() =>
      updateActor(store, owner, {
        actorId: actor.id,
        changes: { name: 'Renamed', 'system.level': 99 },
      }),
    ).toThrow(OperationRejected);
    expect(stored(actor.id).name).toBe('Hero');
  });

  it.each([
    'id',
    'type',
    'kind',
    'worldId',
    'createdAt',
    'updatedAt',
    'schemaVersion',
    'permissions',
    'permissions.default',
    'system',
    'system.items',
    'system.items.0',
    'system.conditions',
    'system.conditions.0.value',
  ])('refuses to change %s with actor.update', (path) => {
    const { owner, actor } = ownedCharacter();
    expect(() =>
      updateActor(store, owner, { actorId: actor.id, changes: { [path]: 'x' } }),
    ).toThrow(/cannot be changed with actor.update/);
    expect(stored(actor.id)).toEqual(actor);
  });

  it('refuses a malformed path', () => {
    const { owner, actor } = ownedCharacter();
    expect(() =>
      updateActor(store, owner, { actorId: actor.id, changes: { 'system..level': 2 } }),
    ).toThrow(/invalid field path/);
    expect(() =>
      updateActor(store, owner, { actorId: actor.id, changes: { '__proto__.x': 2 } }),
    ).toThrow(/invalid field path/);
  });

  it('drops a field the character schema does not know instead of storing it', () => {
    const { owner, actor } = ownedCharacter();
    updateActor(store, owner, { actorId: actor.id, changes: { 'system.bogus': 1 } });
    expect(stored(actor.id).system).not.toHaveProperty('bogus');
  });

  it('keeps each of two updates to different fields (last write wins per field)', () => {
    const { owner, actor } = ownedCharacter();
    updateActor(store, owner, {
      actorId: actor.id,
      changes: { 'system.attributes.str': 2 },
    });
    updateActor(store, owner, {
      actorId: actor.id,
      changes: { 'system.attributes.dex': 3 },
    });
    updateActor(store, owner, {
      actorId: actor.id,
      changes: { 'system.attributes.str': 4 },
    });
    const { attributes } = characterDataSchema.parse(stored(actor.id).system);
    expect(attributes.str).toBe(4);
    expect(attributes.dex).toBe(3);
  });

  it('lets the GM update an actor they do not own', () => {
    const { actor } = ownedCharacter();
    updateActor(store, makeSeat({ isGM: true }), {
      actorId: actor.id,
      changes: { name: 'GM Edit' },
    });
    expect(stored(actor.id).name).toBe('GM Edit');
  });

  it('refuses another player who can see the actor, and treats a hidden one as not found', () => {
    const { actor } = ownedCharacter();
    const outsider = makeSeat();
    expect(() =>
      updateActor(store, outsider, { actorId: actor.id, changes: { name: 'Hijack' } }),
    ).toThrow(/do not have permission/);

    store.putDocument({ ...actor, permissions: { default: 'none', seats: {} } });
    expect(() =>
      updateActor(store, outsider, { actorId: actor.id, changes: { name: 'Hijack' } }),
    ).toThrow(/no actor found/);
    expect(stored(actor.id).name).toBe('Hero');
  });

  it('accepts any system field on an NPC, which has no schema yet', () => {
    const owner = makeSeat();
    const npc = createActor(store, owner, { kind: 'npc', name: 'Innkeeper' });
    updateActor(store, owner, {
      actorId: npc.id,
      changes: { 'system.notes.mood': 'jolly' },
    });
    expect(stored(npc.id).system).toEqual({ notes: { mood: 'jolly' } });
  });
});

describe('deleteActor', () => {
  it('lets the owner delete, and returns a bare tombstone', () => {
    const owner = makeSeat();
    const actor = createActor(store, owner, { kind: 'character', name: 'Hero' });

    const { tombstone, party } = deleteActor(store, owner, { actorId: actor.id });
    expect(party).toBeUndefined();

    expect(store.getDocument(actor.id)).toBeUndefined();
    expect(tombstone.id).toBe(actor.id);
    expect(tombstone).not.toHaveProperty('system');
    expect(tombstone).not.toHaveProperty('name');
  });

  it('lets the GM delete an actor they do not own', () => {
    const actor = createActor(store, makeSeat(), { kind: 'character', name: 'Hero' });
    deleteActor(store, makeSeat({ isGM: true }), { actorId: actor.id });
    expect(store.getDocument(actor.id)).toBeUndefined();
  });

  it('rejects another player who can see the actor but does not own it, and keeps it', () => {
    const actor = createActor(store, makeSeat(), { kind: 'character', name: 'Hero' });
    expect(() => deleteActor(store, makeSeat(), { actorId: actor.id })).toThrow(
      /do not have permission/,
    );
    expect(store.getDocument(actor.id)).toBeDefined();
  });

  it('reports an actor the seat cannot see as not found, not as forbidden', () => {
    const actor = createActor(store, makeSeat(), { kind: 'character', name: 'Hidden' });
    store.putDocument({ ...actor, permissions: { default: 'none', seats: {} } });
    const attempt = () => deleteActor(store, makeSeat(), { actorId: actor.id });
    expect(attempt).toThrow(OperationRejected);
    expect(attempt).toThrow(/no actor found/);
  });

  it('rejects a missing id and a document that is not an actor', () => {
    expect(() =>
      deleteActor(store, makeSeat({ isGM: true }), { actorId: crypto.randomUUID() }),
    ).toThrow(/no actor found/);

    const now = new Date().toISOString();
    const chat = {
      id: crypto.randomUUID(),
      worldId: store.world.id,
      type: 'chatMessage',
      schemaVersion: 1,
      permissions: { default: 'observer' as const, seats: {} },
      createdAt: now,
      updatedAt: now,
    };
    store.putDocument(chat);
    expect(() =>
      deleteActor(store, makeSeat({ isGM: true }), { actorId: chat.id }),
    ).toThrow(/no actor found/);
    expect(store.getDocument(chat.id)).toBeDefined();
  });
});
