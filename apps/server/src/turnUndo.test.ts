import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BaseDocument, Seat } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import {
  createCombat,
  endCombat,
  nextTurn,
  setInitiative,
  spendAction,
  startCombat,
} from './combat.js';
import { setPartyScene } from './party.js';
import { createScene } from './scenes.js';
import { moveToken, placeToken } from './tokens.js';
import {
  decideUndo,
  recordTurnBefores,
  recordTurnUndo,
  undoLastStep,
} from './turnUndo.js';
import { createWorld, type UndoStep, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-turn-undo-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-01T00:00:00.000Z';
const TURN = { combatId: 'c', combatantId: 'a', round: 1 };
const OTHER = { combatId: 'c', combatantId: 'b', round: 1 };

const step = (n: number, turn = TURN): UndoStep => ({ step: n, seatId: 's', ...turn });

describe('decideUndo', () => {
  it('records nothing outside a running turn, or before its first step', () => {
    expect(decideUndo(undefined, undefined, [], undefined)).toEqual({ kind: 'ignore' });
    expect(decideUndo(TURN, TURN, [], { before: 0, after: 0, capacity: 3 })).toEqual({
      kind: 'ignore',
    });
  });

  it('opens a step for a spend that stays within capacity', () => {
    expect(decideUndo(TURN, TURN, [], { before: 0, after: 1, capacity: 3 })).toEqual({
      kind: 'open',
      clearFirst: false,
      dropOldest: false,
    });
  });

  it('adds anything else, and an over-budget spend, to the newest step', () => {
    expect(decideUndo(TURN, TURN, [step(1)], undefined)).toEqual({ kind: 'append' });
    expect(
      decideUndo(TURN, TURN, [step(1)], { before: 3, after: 4, capacity: 3 }),
    ).toEqual({ kind: 'append' });
    expect(
      decideUndo(TURN, TURN, [step(1)], { before: 2, after: 1, capacity: 3 }),
    ).toEqual({ kind: 'append' });
  });

  it('clears the stack, and records nothing, when the turn changes or the combat ends', () => {
    expect(decideUndo(TURN, OTHER, [step(1)], undefined)).toEqual({ kind: 'clear' });
    expect(decideUndo(TURN, undefined, [step(1)], undefined)).toEqual({ kind: 'clear' });
    expect(decideUndo(undefined, TURN, [], { before: 0, after: 1, capacity: 3 })).toEqual(
      {
        kind: 'ignore',
      },
    );
  });

  it('drops a stack left from another turn before opening a new one', () => {
    expect(
      decideUndo(TURN, TURN, [step(1, OTHER)], { before: 0, after: 1, capacity: 3 }),
    ).toEqual({ kind: 'open', clearFirst: true, dropOldest: false });
    expect(decideUndo(TURN, TURN, [step(1, OTHER)], undefined)).toEqual({
      kind: 'clear',
    });
  });

  it('never keeps more steps than the turn has actions', () => {
    expect(
      decideUndo(TURN, TURN, [step(1), step(2), step(3)], {
        before: 2,
        after: 3,
        capacity: 3,
      }),
    ).toEqual({ kind: 'open', clearFirst: false, dropOldest: true });
  });
});

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

/** One operation the way `handleOperation` runs it: applied, then filed under a step, in one transaction. */
function apply(seat: Seat, fn: (store: WorldStore) => void): void {
  const befores = new Map<string, unknown>();
  store.transaction(() => {
    fn(recordTurnBefores(store, befores));
    recordTurnUndo(store, befores, seat.id);
  });
}

/** A running combat of two characters, Ada's turn first. */
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
  startCombat(store, gm, fixed(10), { combatId: combat.id });
  const spendFor = (seat: Seat, tokenId: string, actions = 1) =>
    apply(seat, (s) => spendAction(s, seat, { combatantId: of(tokenId).id, actions }));
  const spend = (seat: Seat, actions = 1) => spendFor(seat, ada.id, actions);
  return { gm, here, combat, adaPlayer, benPlayer, ada, ben, of, spend, spendFor };
}

describe('recordTurnUndo', () => {
  it("opens a step for the active combatant's spend, recording what it changed", () => {
    const { adaPlayer, ada, of, spend } = table();
    const before = store.getDocument(of(ada.id).id);
    spend(adaPlayer);

    const [first] = store.listUndoSteps();
    expect(first).toMatchObject({ seatId: adaPlayer.id, combatantId: of(ada.id).id });
    expect(store.listUndoDocuments(first!.step)).toEqual([
      { documentId: of(ada.id).id, before },
    ]);
  });

  it('files everything after a spend under that spend, whoever does it, first touch only', () => {
    const { gm, adaPlayer, ada, ben, spend } = table();
    spend(adaPlayer);
    const adaBefore = store.getDocument(ada.id);
    const benBefore = store.getDocument(ben.id);
    apply(adaPlayer, (s) => {
      moveToken(s, adaPlayer, { tokenId: ada.id, x: 450, y: 450 });
      moveToken(s, adaPlayer, { tokenId: ada.id, x: 550, y: 450 });
    });
    apply(gm, (s) => moveToken(s, gm, { tokenId: ben.id, x: 650, y: 650 }));

    const steps = store.listUndoSteps();
    expect(steps).toHaveLength(1);
    const recorded = store.listUndoDocuments(steps[0]!.step);
    expect(recorded).toContainEqual({ documentId: ada.id, before: adaBefore });
    expect(recorded).toContainEqual({ documentId: ben.id, before: benBefore });
  });

  it('opens a new step for each spend, and records a created document as absent', () => {
    const { gm, adaPlayer, here, spend } = table();
    spend(adaPlayer);
    spend(adaPlayer);
    let created: BaseDocument | undefined;
    apply(gm, (s) => {
      const actor = createActor(s, gm, { kind: 'npc', name: 'Goblin' });
      created = placeToken(s, { scene: here, actor, size: 1, x: 750, y: 750 });
    });

    const steps = store.listUndoSteps();
    expect(steps).toHaveLength(2);
    expect(store.listUndoDocuments(steps[1]!.step)).toContainEqual({
      documentId: created!.id,
      before: null,
    });
  });

  it("puts the GM's over-budget spend in the last in-budget step", () => {
    const { gm, adaPlayer, spend } = table();
    spend(adaPlayer, 3);
    spend(gm);
    expect(store.listUndoSteps()).toHaveLength(1);
  });

  it('never records a chat message', () => {
    const { adaPlayer, spend } = table();
    spend(adaPlayer);
    const message = {
      id: crypto.randomUUID(),
      worldId: store.world.id,
      type: 'chatMessage',
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      permissions: { default: 'observer', seats: {} },
    } as BaseDocument;
    apply(adaPlayer, (s) => s.putDocument(message));
    const [only] = store.listUndoSteps();
    expect(store.listUndoDocuments(only!.step).map((d) => d.documentId)).not.toContain(
      message.id,
    );
  });

  it('records nothing before the first spend of a turn', () => {
    const { adaPlayer, ada } = table();
    apply(adaPlayer, (s) => moveToken(s, adaPlayer, { tokenId: ada.id, x: 450, y: 450 }));
    expect(store.listUndoSteps()).toEqual([]);
  });

  it('clears the stack when the turn ends, or the combat does', () => {
    const { gm, adaPlayer, ben, combat, spend, spendFor } = table();
    spend(adaPlayer);
    apply(adaPlayer, (s) => nextTurn(s, adaPlayer, { combatId: combat.id }));
    expect(store.listUndoSteps()).toEqual([]);

    spendFor(gm, ben.id);
    expect(store.listUndoSteps()).toHaveLength(1);
    apply(gm, (s) => endCombat(s, gm, { combatId: combat.id }));
    expect(store.listUndoSteps()).toEqual([]);
  });
});

describe('undoLastStep', () => {
  it('writes every document in the step back exactly as it was', () => {
    const { adaPlayer, combat, ada, of, spend } = table();
    const combatantBefore = store.getDocument(of(ada.id).id);
    const tokenBefore = store.getDocument(ada.id);
    spend(adaPlayer);
    apply(adaPlayer, (s) => moveToken(s, adaPlayer, { tokenId: ada.id, x: 450, y: 450 }));

    const { documents } = undoLastStep(store, adaPlayer, { combatId: combat.id });
    expect(documents).toContainEqual(combatantBefore);
    expect(documents).toContainEqual(tokenBefore);
    expect(store.getDocument(of(ada.id).id)).toEqual(combatantBefore);
    expect(store.getDocument(ada.id)).toEqual(tokenBefore);
    expect(store.listUndoSteps()).toEqual([]);
  });

  it('un-creates a document the step created', () => {
    const { gm, adaPlayer, combat, here, spend } = table();
    spend(adaPlayer);
    let created: BaseDocument | undefined;
    apply(gm, (s) => {
      const actor = createActor(s, gm, { kind: 'npc', name: 'Goblin' });
      created = placeToken(s, { scene: here, actor, size: 1, x: 750, y: 750 });
    });

    const { deleted } = undoLastStep(store, gm, { combatId: combat.id });
    expect(deleted.map((doc) => doc.id)).toContain(created!.id);
    expect(store.getDocument(created!.id)).toBeUndefined();
  });

  it('refuses when there is nothing to undo', () => {
    const { gm, combat } = table();
    expect(() => undoLastStep(store, gm, { combatId: combat.id })).toThrow(
      'there is nothing to undo this turn',
    );
  });

  it("refuses a player undoing someone else's step, but lets the GM undo anyone's", () => {
    const { gm, adaPlayer, benPlayer, combat, spend } = table();
    spend(adaPlayer);
    expect(() => undoLastStep(store, benPlayer, { combatId: combat.id })).toThrow(
      'only the GM can undo',
    );
    expect(() => undoLastStep(store, gm, { combatId: combat.id })).not.toThrow();
  });

  it('pops only the newest step, leaving earlier ones for a second undo', () => {
    const { adaPlayer, combat, spend } = table();
    spend(adaPlayer);
    spend(adaPlayer);
    expect(store.listUndoSteps()).toHaveLength(2);
    undoLastStep(store, adaPlayer, { combatId: combat.id });
    expect(store.listUndoSteps()).toHaveLength(1);
    undoLastStep(store, adaPlayer, { combatId: combat.id });
    expect(store.listUndoSteps()).toEqual([]);
  });
});
