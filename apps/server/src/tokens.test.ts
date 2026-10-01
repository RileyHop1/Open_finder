import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, Scene, Seat, Token } from '@hearthtable/core';
import { actorSchema, tokenSchema } from '@hearthtable/core';
import type { CreatureEntry } from '@hearthtable/pf2e';
import { newNpcFromCreature } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, deleteActor } from './actors.js';
import { emptyCompendium } from './compendium.js';
import { setPartyScene } from './party.js';
import { createScene, updateScene } from './scenes.js';
import {
  createToken,
  deleteToken,
  deleteTokensOf,
  placeToken,
  updateToken,
} from './tokens.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-tokens-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-01T00:00:00.000Z';
const compendium = emptyCompendium();

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
const player = () => makeSeat();

function creature(size: CreatureEntry['size']): CreatureEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'bestiary',
    slug: `invented-${size}`,
    name: `Invented ${size}`,
    kind: 'creature',
    provenance: {
      publication: 'Pathfinder Monster Core',
      license: 'ORC',
      remaster: true,
    },
    traits: [],
    ruleElements: [],
    description: '',
    level: 3,
    size,
    perception: 8,
    ac: 19,
    savingThrows: { fortitude: 10, reflex: 6, will: 7 },
    hp: 45,
    resistances: [],
    weaknesses: [],
    speeds: { land: 25 },
    attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
    skills: {},
    strikes: [],
    languages: [],
  };
}

function npc(size: CreatureEntry['size']): Actor {
  const actor = actorSchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'none', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'npc',
    name: `Invented ${size}`,
    system: { ...newNpcFromCreature(creature(size)) },
  });
  store.putDocument(actor);
  return actor;
}

const hero = (): Actor => createActor(store, gm(), { kind: 'character', name: 'Hero' });

const scene = (name = 'Crypt'): Scene => createScene(store, gm(), { name, kind: 'area' });

const stored = (id: string) => tokenSchema.parse(store.getDocument(id));

const tokens = (): Token[] =>
  store.listDocuments('token').map((raw) => tokenSchema.parse(raw));

/** Puts the party in `inScene`, as moving it there would. */
const partyIn = (inScene: Scene) => setPartyScene(store, inScene.id);

describe('createToken', () => {
  it('puts a token at the scene centre by default, snapped to the grid', () => {
    const here = scene();
    const actor = hero();
    const token = createToken(store, compendium, gm(), {
      sceneId: here.id,
      actorId: actor.id,
    });
    expect(token).toMatchObject({
      sceneId: here.id,
      actorId: actor.id,
      x: 1050,
      y: 1050,
      size: 1,
      hidden: false,
    });
    expect(stored(token.id)).toEqual(token);
  });

  it('puts it where asked, snapped to a cell centre', () => {
    const here = scene();
    const token = createToken(store, compendium, gm(), {
      sceneId: here.id,
      actorId: hero().id,
      at: { x: 310, y: 420 },
    });
    expect([token.x, token.y]).toEqual([350, 450]);
  });

  it('sizes a token from the actor and centres a two-square token on a grid intersection', () => {
    const here = scene();
    const ogre = createToken(store, compendium, gm(), {
      sceneId: here.id,
      actorId: npc('large').id,
      at: { x: 310, y: 390 },
    });
    expect(ogre.size).toBe(2);
    expect([ogre.x, ogre.y]).toEqual([300, 400]);
    const giant = createToken(store, compendium, gm(), {
      sceneId: here.id,
      actorId: npc('huge').id,
    });
    expect(giant.size).toBe(3);
  });

  it('does not snap on a gridless scene', () => {
    const here = scene();
    updateScene(store, gm(), { sceneId: here.id, changes: { grid: { type: 'none' } } });
    const token = createToken(store, compendium, gm(), {
      sceneId: here.id,
      actorId: hero().id,
      at: { x: 123.4, y: 567.8 },
    });
    expect([token.x, token.y]).toEqual([123.4, 567.8]);
  });

  it('derives visibility: hidden from players until the party is in the scene, and always when hidden', () => {
    const away = scene('Away');
    const here = scene('Here');
    partyIn(here);
    const make = (sceneId: string, hidden?: boolean) =>
      createToken(store, compendium, gm(), {
        sceneId,
        actorId: hero().id,
        ...(hidden === undefined ? {} : { hidden }),
      }).permissions.default;

    expect(make(here.id)).toBe('observer');
    expect(make(here.id, false)).toBe('observer');
    expect(make(here.id, true)).toBe('none');
    // A pre-placed token on a scene the party has not reached stays invisible.
    expect(make(away.id)).toBe('none');
    expect(make(away.id, true)).toBe('none');
  });

  it('allows a token for a hazard, and a second token for the same actor', () => {
    const here = scene();
    const hazard = createActor(store, gm(), { kind: 'hazard', name: 'Spike pit' });
    const goblin = npc('medium');
    const make = (actorId: string) =>
      createToken(store, compendium, gm(), { sceneId: here.id, actorId });
    expect(make(hazard.id).actorId).toBe(hazard.id);
    make(goblin.id);
    make(goblin.id);
    expect(tokens().filter((t) => t.actorId === goblin.id)).toHaveLength(2);
  });

  it('refuses a player, an unknown scene or actor, a non-scene, and a point off the scene', () => {
    const here = scene();
    const actor = hero();
    const make = (overrides: Record<string, unknown> = {}, seat = gm()) =>
      createToken(store, compendium, seat, {
        sceneId: here.id,
        actorId: actor.id,
        ...overrides,
      });

    expect(() => make({}, player())).toThrow('only the GM');
    expect(() => make({ sceneId: crypto.randomUUID() })).toThrow('no scene found');
    expect(() => make({ sceneId: actor.id })).toThrow('no scene found');
    expect(() => make({ actorId: crypto.randomUUID() })).toThrow('no actor found');
    expect(() => make({ actorId: here.id })).toThrow('no actor found');
    expect(() => make({ at: { x: 2001, y: 5 } })).toThrow('must be on the scene');
    expect(tokens()).toEqual([]);
  });
});

describe('updateToken', () => {
  function placed(
    onScene: Scene,
    overrides: { x?: number; y?: number; hidden?: boolean } = {},
  ) {
    return placeToken(store, {
      scene: onScene,
      actor: hero(),
      size: 1,
      x: overrides.x ?? 350,
      y: overrides.y ?? 450,
      ...(overrides.hidden === undefined ? {} : { hidden: overrides.hidden }),
    });
  }

  it('hides a token on the party’s scene, and shows it again', () => {
    const here = scene();
    partyIn(here);
    const token = placed(here);
    expect(token.permissions.default).toBe('observer');

    const hidden = updateToken(store, gm(), {
      tokenId: token.id,
      changes: { hidden: true },
    });
    expect(hidden.hidden).toBe(true);
    expect(hidden.permissions.default).toBe('none');
    expect(stored(token.id).permissions.default).toBe('none');

    const shown = updateToken(store, gm(), {
      tokenId: token.id,
      changes: { hidden: false },
    });
    expect(shown.permissions.default).toBe('observer');
  });

  it('keeps a token on a scene the party is not in invisible, shown or not', () => {
    const away = scene('Away');
    partyIn(scene('Here'));
    const token = placed(away);
    const shown = updateToken(store, gm(), {
      tokenId: token.id,
      changes: { hidden: false },
    });
    expect(shown.permissions.default).toBe('none');
    const hidden = updateToken(store, gm(), {
      tokenId: token.id,
      changes: { hidden: true },
    });
    expect(hidden.permissions.default).toBe('none');
  });

  it('keeps a hidden token hidden when something else about it changes', () => {
    const here = scene();
    partyIn(here);
    const token = placed(here, { hidden: true });
    const renamed = updateToken(store, gm(), {
      tokenId: token.id,
      changes: { name: 'Lurker' },
    });
    expect(renamed.permissions.default).toBe('none');
    expect(renamed.hidden).toBe(true);
  });

  it('re-snaps when the size changes: a two-square token sits on a grid intersection', () => {
    const here = scene();
    const token = placed(here, { x: 350, y: 450 });
    const bigger = updateToken(store, gm(), { tokenId: token.id, changes: { size: 2 } });
    expect(bigger).toMatchObject({ size: 2, x: 400, y: 500 });
    const smaller = updateToken(store, gm(), { tokenId: token.id, changes: { size: 1 } });
    expect(smaller.size).toBe(1);
    expect((smaller.x - 50) % 100).toBe(0);
    expect((smaller.y - 50) % 100).toBe(0);
  });

  it('leaves the position alone when the size does not change', () => {
    const here = scene();
    const token = placed(here, { x: 123, y: 456 });
    const same = updateToken(store, gm(), { tokenId: token.id, changes: { size: 1 } });
    expect([same.x, same.y]).toEqual([123, 456]);
  });

  it('sets a label, and clears it with null', () => {
    const token = placed(scene());
    const named = updateToken(store, gm(), {
      tokenId: token.id,
      changes: { name: 'Goblin 2' },
    });
    expect(named.name).toBe('Goblin 2');
    const cleared = updateToken(store, gm(), {
      tokenId: token.id,
      changes: { name: null },
    });
    expect(cleared.name).toBeUndefined();
    expect('name' in stored(token.id)).toBe(false);
  });

  it('refuses a player and an unknown token, changing nothing', () => {
    const token = placed(scene());
    expect(() =>
      updateToken(store, player(), { tokenId: token.id, changes: { hidden: true } }),
    ).toThrow('only the GM');
    expect(() =>
      updateToken(store, gm(), {
        tokenId: crypto.randomUUID(),
        changes: { hidden: true },
      }),
    ).toThrow('no token found');
    expect(stored(token.id).hidden).toBe(false);
  });
});

describe('deleteToken', () => {
  it('removes the token, returns its bare envelope, and leaves the actor', () => {
    const actor = hero();
    const token = placeToken(store, { scene: scene(), actor, size: 1, x: 50, y: 50 });
    const tombstone = deleteToken(store, gm(), { tokenId: token.id });
    expect(tombstone.id).toBe(token.id);
    expect(tombstone).not.toHaveProperty('actorId');
    expect(store.getDocument(token.id)).toBeUndefined();
    expect(store.getDocument(actor.id)).toBeDefined();
  });

  it('refuses a player and an unknown token', () => {
    const token = placeToken(store, {
      scene: scene(),
      actor: hero(),
      size: 1,
      x: 50,
      y: 50,
    });
    expect(() => deleteToken(store, player(), { tokenId: token.id })).toThrow(
      'only the GM',
    );
    expect(() => deleteToken(store, gm(), { tokenId: crypto.randomUUID() })).toThrow(
      'no token found',
    );
    expect(store.getDocument(token.id)).toBeDefined();
  });
});

describe('deleting an actor takes its tokens with it', () => {
  it('deleteTokensOf removes the actor’s tokens on every scene, and no one else’s', () => {
    const a = hero();
    const b = createActor(store, gm(), { kind: 'character', name: 'Other' });
    const first = scene('First');
    const second = scene('Second');
    const onFirst = placeToken(store, { scene: first, actor: a, size: 1, x: 50, y: 50 });
    const onSecond = placeToken(store, {
      scene: second,
      actor: a,
      size: 1,
      x: 50,
      y: 50,
    });
    const others = placeToken(store, { scene: first, actor: b, size: 1, x: 150, y: 50 });

    const removed = deleteTokensOf(store, a.id);

    expect(removed.map((d) => d.id).sort()).toEqual([onFirst.id, onSecond.id].sort());
    expect(store.getDocument(others.id)).toBeDefined();
  });

  it('deleteActor reports the tombstones of the actor’s tokens', () => {
    const owner = player();
    const actor = createActor(store, owner, { kind: 'character', name: 'Hero' });
    const token = placeToken(store, { scene: scene(), actor, size: 1, x: 50, y: 50 });

    const { tombstone, tokens: gone } = deleteActor(store, owner, { actorId: actor.id });

    expect(tombstone.id).toBe(actor.id);
    expect(gone.map((d) => d.id)).toEqual([token.id]);
    expect(store.getDocument(token.id)).toBeUndefined();
  });
});
