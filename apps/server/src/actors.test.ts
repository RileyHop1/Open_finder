import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema, resolvePermission } from '@hearthtable/core';
import { characterDataSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, deleteActor } from './actors.js';
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
    const a = createActor(store, seat, { kind: 'character', name: 'A' });
    const b = createActor(store, seat, { kind: 'character', name: 'A' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('deleteActor', () => {
  it('lets the owner delete, and returns a bare tombstone', () => {
    const owner = makeSeat();
    const actor = createActor(store, owner, { kind: 'character', name: 'Hero' });

    const tombstone = deleteActor(store, owner, { actorId: actor.id });

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
