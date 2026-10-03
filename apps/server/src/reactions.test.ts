import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, BaseDocument, Seat, Token } from '@hearthtable/core';
import {
  actorSchema,
  canReadDocument,
  combatantSchema,
  tokenSchema,
} from '@hearthtable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import { createCombat, startCombat } from './combat.js';
import { addPartyMember, setPartyScene } from './party.js';
import { promptReactions } from './reactions.js';
import { createScene } from './scenes.js';
import { moveToken, placeToken } from './tokens.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-reactions-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-01T00:00:00.000Z';

function makeSeat(overrides: Partial<Seat> = {}): Seat {
  return {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    schemaVersion: 1,
    name: 'GM',
    isGM: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const reactiveStrike = () => ({
  id: crypto.randomUUID(),
  entry: {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'class-features',
    slug: 'reactive-strike',
    name: 'Reactive Strike',
    kind: 'classFeature',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
    classSlug: 'fighter',
    level: 1,
  },
  equipped: false,
  quantity: 1,
});

/**
 * A party fighter with Reactive Strike at (250, 250) and a goblin beside it at (350, 250), in a
 * started combat. `moveGoblin` moves the goblin and returns the prompts.
 */
function table(options: { feature?: boolean; party?: boolean } = {}) {
  const gm = makeSeat();
  const owner = makeSeat({ name: 'Ada', isGM: false });
  const stranger = makeSeat({ name: 'Cy', isGM: false });
  const scene = createScene(store, gm, { name: 'Crypt', kind: 'battle' });
  setPartyScene(store, scene.id);

  const fighter = createActor(store, owner, { kind: 'character', name: 'Ada' });
  if (options.feature !== false) {
    const stored = actorSchema.parse(store.getDocument(fighter.id));
    store.putDocument({
      ...stored,
      system: { ...stored.system, items: [reactiveStrike()] },
    } as Actor);
  }
  addPartyMember(store, gm, { actorId: fighter.id });
  const fighterToken = placeToken(store, {
    scene,
    actor: fighter,
    size: 1,
    x: 250,
    y: 250,
  });

  const goblin = createActor(store, gm, { kind: 'character', name: 'Goblin' });
  if (options.party === true) {
    addPartyMember(store, gm, { actorId: goblin.id });
  }
  const goblinToken = placeToken(store, {
    scene,
    actor: goblin,
    size: 1,
    x: 350,
    y: 250,
  });
  const { combat } = createCombat(store, gm, { sceneId: scene.id });
  startCombat(store, gm, () => 10, { combatId: combat.id });

  const moveGoblin = (to: { x: number; y: number }) => {
    const before = tokenSchema.parse(store.getDocument(goblinToken.id));
    const after = moveToken(store, gm, { tokenId: goblinToken.id, ...to })!;
    return promptReactions(store, gm, before, after);
  };
  const combatantOf = (tokenId: string) =>
    store
      .listDocuments('combatant')
      .map((raw) => combatantSchema.parse(raw))
      .find((c) => c.tokenId === tokenId)!;
  return {
    gm,
    owner,
    stranger,
    fighter,
    fighterToken,
    goblinToken,
    combat,
    moveGoblin,
    combatantOf,
  };
}

describe('promptReactions', () => {
  it('tells the owner of a creature with Reactive Strike when an enemy moves out of its reach', () => {
    const { owner, gm, stranger, moveGoblin } = table();
    const [prompt, ...rest] = moveGoblin({ x: 550, y: 250 });
    expect(rest).toEqual([]);
    expect(prompt?.text).toBe(
      'Ada can use Reactive Strike: Goblin moved out of their reach.',
    );
    expect(canReadDocument(owner, prompt as BaseDocument)).toBe(true);
    expect(canReadDocument(gm, prompt as BaseDocument)).toBe(true);
    expect(canReadDocument(stranger, prompt as BaseDocument)).toBe(false);
  });

  it('also prompts when the mover stays within reach, since it still left its square', () => {
    const { moveGoblin } = table();
    expect(moveGoblin({ x: 350, y: 150 })).toHaveLength(1);
  });

  it('never spends the reaction for the player', () => {
    const { moveGoblin, combatantOf, fighterToken } = table();
    moveGoblin({ x: 550, y: 250 });
    expect(combatantOf(fighterToken.id).turn.reactionUsed).toBe(false);
  });

  it('prompts nothing for a creature without the feature', () => {
    expect(table({ feature: false }).moveGoblin({ x: 550, y: 250 })).toEqual([]);
  });

  it("prompts nothing when the mover is on the reactor's own side", () => {
    expect(table({ party: true }).moveGoblin({ x: 550, y: 250 })).toEqual([]);
  });

  it('prompts nothing once the reaction is spent', () => {
    const { moveGoblin, combatantOf, fighterToken } = table();
    const spent = combatantOf(fighterToken.id);
    store.putDocument({
      ...spent,
      turn: { ...spent.turn, reactionUsed: true },
    } as BaseDocument);
    expect(moveGoblin({ x: 550, y: 250 })).toEqual([]);
  });

  it('prompts nothing when the reactor cannot act', () => {
    const { moveGoblin, fighter } = table();
    const stored = actorSchema.parse(store.getDocument(fighter.id));
    store.putDocument({
      ...stored,
      system: { ...stored.system, conditions: [{ slug: 'unconscious' }] },
    } as Actor);
    expect(moveGoblin({ x: 550, y: 250 })).toEqual([]);
  });

  it("prompts nothing when the mover started outside the reactor's reach", () => {
    const { moveGoblin } = table();
    moveGoblin({ x: 550, y: 250 });
    expect(moveGoblin({ x: 750, y: 250 })).toEqual([]);
  });

  it('prompts nothing outside an active combat, or when the token did not change square', () => {
    const { gm, goblinToken, combat, moveGoblin } = table();
    const before: Token = tokenSchema.parse(store.getDocument(goblinToken.id));
    expect(promptReactions(store, gm, before, before)).toEqual([]);
    void moveGoblin;
    store.putDocument({ ...combat, status: 'ended' } as BaseDocument);
    const after = moveToken(store, gm, { tokenId: goblinToken.id, x: 550, y: 250 })!;
    expect(promptReactions(store, gm, before, after)).toEqual([]);
  });

  it('calls a mover the table cannot see "a hidden creature"', () => {
    const { gm, goblinToken, moveGoblin } = table();
    store.putDocument({
      ...tokenSchema.parse(store.getDocument(goblinToken.id)),
      permissions: { default: 'none', seats: {} },
    });
    void gm;
    expect(moveGoblin({ x: 550, y: 250 })[0]?.text).toContain('A hidden creature moved');
  });
});
