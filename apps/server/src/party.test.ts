import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { partySchema } from '@hearthtable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, deleteActor } from './actors.js';
import {
  addPartyMember,
  removeFromParty,
  removePartyMember,
  reorderParty,
} from './party.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-party-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-09-30T00:00:00.000Z';

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  return {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    schemaVersion: 1,
    name: 'Valeros',
    isGM: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const gm = () => makeSeat({ name: 'GM', isGM: true });
const hero = (name: string, kind: 'character' | 'npc' | 'hazard' = 'character') =>
  createActor(store, makeSeat(), { kind, name }).id;
const members = () => partySchema.parse(store.listDocuments('party')[0]).memberIds;

describe('addPartyMember', () => {
  it('creates the party on first use and appends members in order', () => {
    const [a, b] = [hero('A'), hero('B')];
    expect(store.listDocuments('party')).toEqual([]);

    addPartyMember(store, gm(), { actorId: a });
    addPartyMember(store, gm(), { actorId: b });

    expect(store.listDocuments('party')).toHaveLength(1);
    expect(members()).toEqual([a, b]);
  });

  it('makes the party visible to everyone and owned by no player', () => {
    const party = addPartyMember(store, gm(), { actorId: hero('A') });
    expect(party.permissions).toEqual({ default: 'observer', seats: {} });
  });

  it('adding a current member changes nothing', () => {
    const a = hero('A');
    addPartyMember(store, gm(), { actorId: a });
    addPartyMember(store, gm(), { actorId: a });
    expect(members()).toEqual([a]);
  });

  it('refuses a player, even for their own character', () => {
    const player = makeSeat();
    const mine = createActor(store, player, { kind: 'character', name: 'Mine' }).id;
    expect(() => addPartyMember(store, player, { actorId: mine })).toThrow(/only the GM/);
    expect(store.listDocuments('party')).toEqual([]);
  });

  it('refuses something that is not an actor, and a hazard', () => {
    expect(() => addPartyMember(store, gm(), { actorId: crypto.randomUUID() })).toThrow(
      /no actor found/,
    );
    expect(() =>
      addPartyMember(store, gm(), { actorId: hero('Spikes', 'hazard') }),
    ).toThrow(/hazard/);
  });

  it('accepts an NPC companion', () => {
    const npc = hero('Companion', 'npc');
    addPartyMember(store, gm(), { actorId: npc });
    expect(members()).toEqual([npc]);
  });
});

describe('removePartyMember', () => {
  it('removes one member and keeps the order of the rest', () => {
    const [a, b, c] = [hero('A'), hero('B'), hero('C')];
    for (const id of [a, b, c]) {
      addPartyMember(store, gm(), { actorId: id });
    }
    removePartyMember(store, gm(), { actorId: b });
    expect(members()).toEqual([a, c]);
  });

  it('is not an error to remove a non-member, or when there is no party', () => {
    expect(removePartyMember(store, gm(), { actorId: hero('A') })).toBeUndefined();
    addPartyMember(store, gm(), { actorId: hero('B') });
    expect(removePartyMember(store, gm(), { actorId: hero('C') })).toBeUndefined();
  });

  it('refuses a player', () => {
    expect(() => removePartyMember(store, makeSeat(), { actorId: hero('A') })).toThrow(
      /only the GM/,
    );
  });
});

describe('reorderParty', () => {
  it('sets a new order', () => {
    const [a, b, c] = [hero('A'), hero('B'), hero('C')];
    for (const id of [a, b, c]) {
      addPartyMember(store, gm(), { actorId: id });
    }
    reorderParty(store, gm(), { memberIds: [c, a, b] });
    expect(members()).toEqual([c, a, b]);
  });

  it('rejects a list that adds, drops, or repeats someone', () => {
    const [a, b] = [hero('A'), hero('B')];
    addPartyMember(store, gm(), { actorId: a });
    addPartyMember(store, gm(), { actorId: b });
    for (const memberIds of [[a], [a, b, hero('C')], [a, a], [a, crypto.randomUUID()]]) {
      expect(() => reorderParty(store, gm(), { memberIds })).toThrow(
        /exactly the current party members/,
      );
    }
    expect(members()).toEqual([a, b]);
  });

  it('refuses a player', () => {
    const a = hero('A');
    addPartyMember(store, gm(), { actorId: a });
    expect(() => reorderParty(store, makeSeat(), { memberIds: [a] })).toThrow(
      /only the GM/,
    );
  });
});

describe('deleting a member', () => {
  it('takes the actor out of the party and hands back the changed party', () => {
    const owner = makeSeat();
    const doomed = createActor(store, owner, { kind: 'character', name: 'Doomed' }).id;
    const stays = hero('Stays');
    addPartyMember(store, gm(), { actorId: doomed });
    addPartyMember(store, gm(), { actorId: stays });

    const { party } = deleteActor(store, owner, { actorId: doomed });

    expect(party?.memberIds).toEqual([stays]);
    expect(members()).toEqual([stays]);
  });

  it('leaves the party alone when the deleted actor was not in it', () => {
    const owner = makeSeat();
    const loose = createActor(store, owner, { kind: 'character', name: 'Loose' }).id;
    addPartyMember(store, gm(), { actorId: hero('A') });
    expect(deleteActor(store, owner, { actorId: loose }).party).toBeUndefined();
  });

  it('removeFromParty does nothing when no party exists', () => {
    expect(removeFromParty(store, crypto.randomUUID())).toBeUndefined();
  });
});
