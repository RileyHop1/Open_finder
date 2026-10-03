import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { combatantSchema, combatSchema } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import {
  createCombat,
  endCombat,
  nextTurn,
  setInitiative,
  setMovementRuling,
  startCombat,
} from './combat.js';
import { setPartyScene } from './party.js';
import { createScene } from './scenes.js';
import { previewTokenDrag } from './tokenDrag.js';
import { moveToken, placeToken } from './tokens.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-movement-test-'));
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
    name: 'Valeros',
    isGM: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const fixed =
  (face: number): RandomSource =>
  () =>
    face;

/**
 * A scene the party is in, with two players who each own a character and its
 * token, and a combat (not yet started) of those two. Ada has the higher initiative.
 */
function table() {
  const gm = makeSeat({ name: 'GM', isGM: true });
  const here = createScene(store, gm, { name: 'Crypt', kind: 'battle' });
  setPartyScene(store, here.id);
  const place = (owner: Seat, name: string) => {
    const actor = createActor(store, owner, { kind: 'character', name });
    return placeToken(store, { scene: here, actor, size: 1, x: 350, y: 450 });
  };
  const adaPlayer = makeSeat({ name: 'Ada' });
  const benPlayer = makeSeat({ name: 'Ben' });
  const ada = place(adaPlayer, 'Ada');
  const ben = place(benPlayer, 'Ben');
  const { combat, combatants } = createCombat(store, gm, { sceneId: here.id });
  const of = (tokenId: string) => combatants.find((c) => c.tokenId === tokenId)!;
  setInitiative(store, gm, { combatantId: of(ada.id).id, initiative: 20 });
  setInitiative(store, gm, { combatantId: of(ben.id).id, initiative: 10 });
  const start = () => startCombat(store, gm, fixed(10), { combatId: combat.id });
  const target = { x: 750, y: 850 };
  return { gm, here, combat, adaPlayer, benPlayer, ada, ben, of, start, target, place };
}

describe('moving while there is a combat', () => {
  it('is free before the combat starts, and after it ends', () => {
    const { gm, combat, benPlayer, ben, start, target } = table();
    expect(() =>
      moveToken(store, benPlayer, { tokenId: ben.id, ...target }),
    ).not.toThrow();
    start();
    endCombat(store, gm, { combatId: combat.id });
    expect(() =>
      moveToken(store, benPlayer, { tokenId: ben.id, ...target }),
    ).not.toThrow();
  });

  it('follows the turn once it starts: refused out of turn, allowed on your own', () => {
    const { gm, combat, adaPlayer, benPlayer, ada, ben, start, target } = table();
    start();
    expect(() => moveToken(store, benPlayer, { tokenId: ben.id, ...target })).toThrow(
      "not this token's turn",
    );
    expect(
      previewTokenDrag(store, benPlayer, { tokenId: ben.id, ...target }),
    ).toBeUndefined();
    expect(() =>
      moveToken(store, adaPlayer, { tokenId: ada.id, ...target }),
    ).not.toThrow();
    expect(
      previewTokenDrag(store, adaPlayer, { tokenId: ada.id, ...target }),
    ).toBeDefined();

    nextTurn(store, gm, { combatId: combat.id });
    expect(() =>
      moveToken(store, benPlayer, { tokenId: ben.id, x: 450, y: 450 }),
    ).not.toThrow();
    expect(() =>
      moveToken(store, adaPlayer, { tokenId: ada.id, x: 450, y: 550 }),
    ).toThrow("not this token's turn");
  });

  it('never blocks the GM, nor a token that is not in the combat', () => {
    const { gm, ben, start, target, place } = table();
    start();
    expect(() => moveToken(store, gm, { tokenId: ben.id, ...target })).not.toThrow();
    const spectator = makeSeat({ name: 'Cy' });
    const bystander = place(spectator, 'Cy');
    expect(() =>
      moveToken(store, spectator, { tokenId: bystander.id, ...target }),
    ).not.toThrow();
  });
});

describe('setMovementRuling', () => {
  it('lifts the turn rule for everyone with freeMovement, and puts it back', () => {
    const { gm, combat, benPlayer, ben, start, target } = table();
    start();
    setMovementRuling(store, gm, { combatId: combat.id, freeMovement: true });
    expect(combatSchema.parse(store.getDocument(combat.id)).freeMovement).toBe(true);
    expect(() =>
      moveToken(store, benPlayer, { tokenId: ben.id, ...target }),
    ).not.toThrow();
    setMovementRuling(store, gm, { combatId: combat.id, freeMovement: false });
    expect(() =>
      moveToken(store, benPlayer, { tokenId: ben.id, x: 450, y: 450 }),
    ).toThrow("not this token's turn");
  });

  it("lets one token move out of turn with a grant, until that combatant's turn ends", () => {
    const { gm, combat, benPlayer, ben, of, start, target } = table();
    start();
    const doc = setMovementRuling(store, gm, {
      combatId: combat.id,
      grant: { combatantId: of(ben.id).id, allowed: true },
    }).documents;
    expect(doc).toHaveLength(1);
    expect(() =>
      moveToken(store, benPlayer, { tokenId: ben.id, ...target }),
    ).not.toThrow();

    nextTurn(store, gm, { combatId: combat.id });
    nextTurn(store, gm, { combatId: combat.id });
    expect(combatantSchema.parse(store.getDocument(of(ben.id).id)).movementGrant).toBe(
      false,
    );
    expect(() =>
      moveToken(store, benPlayer, { tokenId: ben.id, x: 450, y: 450 }),
    ).toThrow("not this token's turn");
  });

  it('can take a grant back', () => {
    const { gm, combat, benPlayer, ben, of, start, target } = table();
    start();
    const grant = (allowed: boolean) =>
      setMovementRuling(store, gm, {
        combatId: combat.id,
        grant: { combatantId: of(ben.id).id, allowed },
      });
    grant(true);
    grant(false);
    expect(() => moveToken(store, benPlayer, { tokenId: ben.id, ...target })).toThrow(
      "not this token's turn",
    );
  });

  it('is the GM only, refuses an ended combat, and a combatant from another combat', () => {
    const { gm, combat, adaPlayer, start } = table();
    expect(() =>
      setMovementRuling(store, adaPlayer, { combatId: combat.id, freeMovement: true }),
    ).toThrow('only the GM');
    start();
    expect(() =>
      setMovementRuling(store, gm, {
        combatId: combat.id,
        grant: { combatantId: crypto.randomUUID(), allowed: true },
      }),
    ).toThrow('no combatant found');
    endCombat(store, gm, { combatId: combat.id });
    expect(() =>
      setMovementRuling(store, gm, { combatId: combat.id, freeMovement: true }),
    ).toThrow('has ended');
  });
});
