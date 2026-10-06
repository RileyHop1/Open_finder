import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, BaseDocument, Token } from '@hearthtable/core';
import { actorSchema, tokenSchema } from '@hearthtable/core';
import type { CreatureEntry } from '@hearthtable/pf2e';
import { newNpcFromCreature } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hpPercent, syncTokenHpBars } from './tokenHpBars.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-hpbars-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-01T00:00:00.000Z';

const creature: CreatureEntry = {
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'bestiary',
  slug: 'invented-goblin',
  name: 'Invented Goblin',
  kind: 'creature',
  provenance: { publication: 'Pathfinder Monster Core', license: 'ORC', remaster: true },
  traits: [],
  ruleElements: [],
  description: '',
  level: 3,
  size: 'medium',
  perception: 8,
  ac: 19,
  savingThrows: { fortitude: 10, reflex: 6, will: 7 },
  hp: 40,
  resistances: [],
  weaknesses: [],
  speeds: { land: 25 },
  attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
  skills: {},
  strikes: [],
  languages: [],
};

function npc(kind: Actor['kind'] = 'npc'): Actor {
  const actor = actorSchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'none', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind,
    name: 'Goblin',
    system: { ...newNpcFromCreature(creature) },
  });
  store.putDocument(actor);
  return actor;
}

function tokenFor(actor: Actor, fields: Partial<Token> = {}): Token {
  const token = tokenSchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'token',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    sceneId: crypto.randomUUID(),
    actorId: actor.id,
    x: 50,
    y: 50,
    ...fields,
  });
  store.putDocument(token);
  return token;
}

const stored = (id: string) => tokenSchema.parse(store.getDocument(id));

/** Sets the NPC's current hit points, as a damage operation would. */
function setHp(actor: Actor, current: number): Actor {
  const next = actorSchema.parse({
    ...actor,
    system: { ...(actor.system as object), hp: { current, temp: 0 } },
  });
  store.putDocument(next);
  return next;
}

describe('hpPercent', () => {
  it('rounds to a whole percentage and stays within 0 to 100', () => {
    expect(hpPercent(40, 40)).toBe(100);
    expect(hpPercent(10, 40)).toBe(25);
    expect(hpPercent(1, 3)).toBe(33);
    expect(hpPercent(-5, 40)).toBe(0);
    expect(hpPercent(60, 40)).toBe(100);
  });

  it('reads a maximum of zero as empty rather than dividing by it', () => {
    expect(hpPercent(5, 0)).toBe(0);
  });
});

describe('syncTokenHpBars', () => {
  it('leaves a token with its bar off carrying no percentage', () => {
    const actor = npc();
    const token = tokenFor(actor);
    expect(syncTokenHpBars(store, [actor])).toEqual([actor]);
    expect(stored(token.id).hpBar).toBeUndefined();
  });

  it('fills the bar when the token turns it on, and adds the token to what is broadcast', () => {
    const actor = npc();
    const token = tokenFor(actor, { showHpBar: true });
    const documents = syncTokenHpBars(store, [token]);
    expect(stored(token.id).hpBar).toEqual({ percent: 100 });
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ id: token.id, hpBar: { percent: 100 } });
  });

  it('follows the monster as it is hurt and healed, replacing nothing else', () => {
    const actor = npc();
    const token = tokenFor(actor, { showHpBar: true });
    syncTokenHpBars(store, [token]);

    const hurt = syncTokenHpBars(store, [setHp(actor, 10)]);
    expect(stored(token.id).hpBar).toEqual({ percent: 25 });
    expect(hurt.map((d: BaseDocument) => d.id).sort()).toEqual(
      [actor.id, token.id].sort(),
    );

    syncTokenHpBars(store, [setHp(actor, 40)]);
    expect(stored(token.id).hpBar).toEqual({ percent: 100 });
  });

  it('clears the percentage when the GM turns the bar off, so no number is left behind', () => {
    const actor = npc();
    const token = tokenFor(actor, { showHpBar: true });
    syncTokenHpBars(store, [token]);
    const off = tokenSchema.parse({ ...stored(token.id), showHpBar: false });
    store.putDocument(off);
    syncTokenHpBars(store, [off]);
    expect(stored(token.id).hpBar).toBeUndefined();
  });

  it('writes nothing when the percentage has not changed', () => {
    const actor = npc();
    const token = tokenFor(actor, { showHpBar: true });
    syncTokenHpBars(store, [token]);
    const before = stored(token.id).updatedAt;
    const documents = syncTokenHpBars(store, [actor]);
    expect(documents).toEqual([actor]);
    expect(stored(token.id).updatedAt).toBe(before);
  });

  it('updates every token of the same monster, and no one else', () => {
    const actor = npc();
    const other = npc();
    const a = tokenFor(actor, { showHpBar: true });
    const b = tokenFor(actor, { showHpBar: true });
    const c = tokenFor(other, { showHpBar: true });
    syncTokenHpBars(store, [a, b, c]);
    syncTokenHpBars(store, [setHp(actor, 20)]);
    expect(stored(a.id).hpBar).toEqual({ percent: 50 });
    expect(stored(b.id).hpBar).toEqual({ percent: 50 });
    expect(stored(c.id).hpBar).toEqual({ percent: 100 });
  });

  it('gives a character token no percentage: its owner reads the actor itself', () => {
    const character = npc('character');
    const token = tokenFor(character, { showHpBar: true });
    syncTokenHpBars(store, [token]);
    expect(stored(token.id).hpBar).toBeUndefined();
  });

  it('ignores operations that touched neither an actor nor a token', () => {
    const actor = npc();
    tokenFor(actor, { showHpBar: true });
    const message = { id: crypto.randomUUID(), type: 'chatMessage' } as BaseDocument;
    expect(syncTokenHpBars(store, [message])).toEqual([message]);
  });
});
