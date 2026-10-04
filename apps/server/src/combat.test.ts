import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, BaseDocument, Combatant, Seat, Token } from '@hearthtable/core';
import {
  actorSchema,
  combatantSchema,
  canReadDocument,
  combatSchema,
  sceneSchema,
} from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import {
  addCombatant,
  cascadeCombatDeletion,
  combatantPermissions,
  combatPermissions,
  createCombat,
  endCombat,
  joinCombat,
  moveCombatant,
  nextTurn,
  previousTurn,
  removeCombatant,
  rollInitiative,
  setInitiative,
  startCombat,
} from './combat.js';
import { addPartyMember } from './party.js';
import { createScene, deleteScene } from './scenes.js';
import { placeToken } from './tokens.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-combat-test-'));
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

const gm = () => makeSeat({ name: 'GM', isGM: true });
const player = () => makeSeat();

/** A battle scene, plus a helper that puts a new actor's token on it. */
/** Stores `document` with some of its own fields changed: `putDocument` takes the bare envelope, so a typed variable avoids its excess-property check. */
function save(document: BaseDocument): void {
  store.putDocument(document);
}

function setup() {
  const seat = gm();
  const scene = createScene(store, seat, { name: 'The Crypt', kind: 'battle' });
  const put = (name: string, hidden = false): { actor: Actor; token: Token } => {
    const actor = createActor(store, seat, { kind: 'character', name });
    const token = placeToken(store, { scene, actor, size: 1, x: 100, y: 100, hidden });
    return { actor, token };
  };
  return { seat, scene, put };
}

describe('createCombat', () => {
  it('makes a pending combat that players cannot read, enrolling every visible token', () => {
    const { seat, scene, put } = setup();
    const a = put('Valeria');
    const b = put('Goblin');
    const { combat, combatants } = createCombat(store, seat, { sceneId: scene.id });

    expect(combat).toMatchObject({
      sceneId: scene.id,
      status: 'pending',
      round: 0,
      permissions: { default: 'none' },
    });
    expect(combatants.map((c) => c.tokenId).sort()).toEqual(
      [a.token.id, b.token.id].sort(),
    );
    for (const combatant of combatants) {
      expect(combatant).toMatchObject({
        combatId: combat.id,
        hidden: false,
        permissions: { default: 'none' },
      });
      expect(combatant.initiative).toBeUndefined();
    }
    expect(combatSchema.parse(store.getDocument(combat.id)).id).toBe(combat.id);
  });

  it('leaves a hidden token out, unless it belongs to the party', () => {
    const { seat, scene, put } = setup();
    put('Goblin', true);
    const hero = put('Valeria', true);
    addPartyMember(store, seat, { actorId: hero.actor.id });
    const { combatants } = createCombat(store, seat, { sceneId: scene.id });
    expect(combatants.map((c) => c.tokenId)).toEqual([hero.token.id]);
  });

  it('ignores tokens on other scenes', () => {
    const { seat, scene, put } = setup();
    const other = createScene(store, seat, { name: 'Elsewhere', kind: 'area' });
    const stray = createActor(store, seat, { kind: 'character', name: 'Stray' });
    placeToken(store, { scene: other, actor: stray, size: 1, x: 100, y: 100 });
    put('Valeria');
    expect(createCombat(store, seat, { sceneId: scene.id }).combatants).toHaveLength(1);
  });

  it('allows one unfinished combat at a time, but not a finished one', () => {
    const { seat, scene } = setup();
    const { combat } = createCombat(store, seat, { sceneId: scene.id });
    expect(() => createCombat(store, seat, { sceneId: scene.id })).toThrow(
      'already set up',
    );
    save({ ...combat, status: 'ended' } as BaseDocument);
    expect(() => createCombat(store, seat, { sceneId: scene.id })).not.toThrow();
  });

  it('is the GM only, and needs a real scene', () => {
    const { seat, scene } = setup();
    expect(() => createCombat(store, player(), { sceneId: scene.id })).toThrow(
      'only the GM',
    );
    expect(() => createCombat(store, seat, { sceneId: crypto.randomUUID() })).toThrow(
      'no scene found',
    );
  });
});

describe('addCombatant', () => {
  it('adds a token that is on the scene, hidden if asked', () => {
    const { seat, scene, put } = setup();
    const { combat } = createCombat(store, seat, { sceneId: scene.id });
    const goblin = put('Goblin', true);
    const combatant = addCombatant(store, seat, {
      combatId: combat.id,
      tokenId: goblin.token.id,
      hidden: true,
    });
    expect(combatant).toMatchObject({
      tokenId: goblin.token.id,
      actorId: goblin.actor.id,
      hidden: true,
      permissions: { default: 'none' },
    });
    expect(combatantSchema.parse(store.getDocument(combatant.id)).id).toBe(combatant.id);
  });

  it('refuses a token twice, one off the scene, a missing combat, and a finished combat', () => {
    const { seat, scene, put } = setup();
    const hero = put('Valeria');
    const { combat } = createCombat(store, seat, { sceneId: scene.id });
    expect(() =>
      addCombatant(store, seat, { combatId: combat.id, tokenId: hero.token.id }),
    ).toThrow('already in the combat');

    const other = createScene(store, seat, { name: 'Elsewhere', kind: 'area' });
    const stray = createActor(store, seat, { kind: 'character', name: 'Stray' });
    const away = placeToken(store, { scene: other, actor: stray, size: 1, x: 1, y: 1 });
    expect(() =>
      addCombatant(store, seat, { combatId: combat.id, tokenId: away.id }),
    ).toThrow('not on the combat');
    expect(() =>
      addCombatant(store, seat, { combatId: crypto.randomUUID(), tokenId: away.id }),
    ).toThrow('no combat found');

    save({ ...combat, status: 'ended' } as BaseDocument);
    const late = put('Late');
    expect(() =>
      addCombatant(store, seat, { combatId: combat.id, tokenId: late.token.id }),
    ).toThrow('has ended');
  });

  it('is the GM only', () => {
    const { seat, scene, put } = setup();
    const { combat } = createCombat(store, seat, { sceneId: scene.id });
    const late = put('Late');
    expect(() =>
      addCombatant(store, player(), { combatId: combat.id, tokenId: late.token.id }),
    ).toThrow('only the GM');
  });
});

describe('removeCombatant', () => {
  it('removes the combatant and ends conditions anchored to its turn', () => {
    const { seat, scene, put } = setup();
    const valeria = put('Valeria');
    const goblin = put('Goblin');
    const { combatants } = createCombat(store, seat, { sceneId: scene.id });
    const leaving = combatants.find((c) => c.actorId === valeria.actor.id)!;

    const held = actorSchema.parse(store.getDocument(goblin.actor.id));
    save({
      ...held,
      system: {
        ...(held.system as object),
        conditions: [
          {
            slug: 'grabbed',
            duration: { type: 'turn', combatantId: leaving.id, boundary: 'end' },
          },
          { slug: 'frightened', value: 1 },
        ],
      },
    } as BaseDocument);

    const { deleted, changed } = removeCombatant(store, seat, {
      combatantId: leaving.id,
    });
    expect(deleted.id).toBe(leaving.id);
    expect(store.getDocument(leaving.id)).toBeUndefined();
    expect(changed.map((doc) => doc.id)).toEqual([goblin.actor.id]);
    const after = actorSchema.parse(store.getDocument(goblin.actor.id));
    expect(
      (after.system as { conditions: { slug: string }[] }).conditions.map((c) => c.slug),
    ).toEqual(['frightened']);
  });

  it('refuses the combatant whose turn it is, a missing one, and a non-GM', () => {
    const { seat, scene, put } = setup();
    put('Valeria');
    const { combat, combatants } = createCombat(store, seat, { sceneId: scene.id });
    const [first] = combatants;
    save({ ...combat, status: 'active', activeCombatantId: first!.id } as BaseDocument);
    expect(() => removeCombatant(store, seat, { combatantId: first!.id })).toThrow(
      'end this combatant',
    );
    expect(() =>
      removeCombatant(store, seat, { combatantId: crypto.randomUUID() }),
    ).toThrow('no combatant found');
    expect(() => removeCombatant(store, player(), { combatantId: first!.id })).toThrow(
      'only the GM',
    );
  });
});

describe('permissions', () => {
  it('hides a combat until it begins, and a combatant until then or if hidden', () => {
    expect(combatPermissions('pending').default).toBe('none');
    expect(combatPermissions('active').default).toBe('observer');
    expect(combatPermissions('ended').default).toBe('observer');
    expect(combatantPermissions('pending', false).default).toBe('none');
    expect(combatantPermissions('active', false).default).toBe('observer');
    expect(combatantPermissions('active', true).default).toBe('none');
  });
});

describe('cascadeCombatDeletion', () => {
  const envelope = (id: string): BaseDocument => baseDocumentSchemaFor(id);

  function baseDocumentSchemaFor(id: string): BaseDocument {
    return {
      id,
      worldId: store.world.id,
      type: 'token',
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      permissions: { default: 'none', seats: {} },
    };
  }

  it("removes a deleted token's combatant and ends conditions anchored to it", () => {
    const { seat, scene, put } = setup();
    const valeria = put('Valeria');
    const goblin = put('Goblin');
    const { combatants } = createCombat(store, seat, { sceneId: scene.id });
    const mine = combatants.find((c) => c.tokenId === valeria.token.id)!;
    const held = actorSchema.parse(store.getDocument(goblin.actor.id));
    save({
      ...held,
      system: {
        ...(held.system as object),
        conditions: [
          {
            slug: 'grabbed',
            duration: { type: 'turn', combatantId: mine.id, boundary: 'end' },
          },
        ],
      },
    } as BaseDocument);

    store.deleteDocument(valeria.token.id);
    const { deleted, changed } = cascadeCombatDeletion(store, [
      envelope(valeria.token.id),
    ]);
    expect(deleted.map((doc) => doc.id)).toEqual([mine.id]);
    expect(store.getDocument(mine.id)).toBeUndefined();
    expect(changed.map((doc) => doc.id)).toEqual([goblin.actor.id]);
    expect(combatantsLeft()).toHaveLength(1);
  });

  it('clears the active pointer when a surviving combat loses its active combatant', () => {
    const { seat, scene, put } = setup();
    put('Valeria');
    put('Goblin');
    const { combat, combatants } = createCombat(store, seat, { sceneId: scene.id });
    const [first] = combatants;
    save({ ...combat, status: 'active', activeCombatantId: first!.id } as BaseDocument);

    store.deleteDocument(first!.tokenId);
    const { changed } = cascadeCombatDeletion(store, [envelope(first!.tokenId)]);
    expect(changed.map((doc) => doc.id)).toEqual([combat.id]);
    expect(
      combatSchema.parse(store.getDocument(combat.id)).activeCombatantId,
    ).toBeUndefined();
  });

  it("deletes a deleted scene's combats and every combatant in them", () => {
    const { seat, scene, put } = setup();
    put('Valeria');
    put('Goblin');
    const { combat } = createCombat(store, seat, { sceneId: scene.id });
    const { deleted: sceneDeleted } = deleteScene(store, seat, { sceneId: scene.id });
    const { deleted } = cascadeCombatDeletion(store, sceneDeleted);
    expect(deleted).toHaveLength(3);
    expect(deleted.map((doc) => doc.id)).toContain(combat.id);
    expect(store.listDocuments('combat')).toEqual([]);
    expect(combatantsLeft()).toEqual([]);
  });

  it('leaves other combats and combatants alone', () => {
    const { seat, scene, put } = setup();
    put('Valeria');
    createCombat(store, seat, { sceneId: scene.id });
    expect(cascadeCombatDeletion(store, [envelope(crypto.randomUUID())])).toEqual({
      deleted: [],
      changed: [],
    });
    expect(combatantsLeft()).toHaveLength(1);
  });

  function combatantsLeft(): unknown[] {
    return store.listDocuments('combatant');
  }
});

const fixed =
  (face: number): RandomSource =>
  () =>
    face;

/** A pending combat with `names` as its combatants, in join order. */
function fight(...names: string[]) {
  const { seat, scene, put } = setup();
  const actors = names.map((name) => put(name));
  const { combat, combatants } = createCombat(store, seat, { sceneId: scene.id });
  const byName = (name: string): Combatant =>
    combatants.find((c) => c.actorId === actors[names.indexOf(name)]!.actor.id)!;
  const stored = (id: string) => combatantSchema.parse(store.getDocument(id));
  return { seat, combat, byName, stored };
}

describe('rollInitiative', () => {
  it("rolls Perception and stores the total as the combatant's initiative", () => {
    const { seat, byName, stored } = fight('Valeria');
    const valeria = byName('Valeria');
    const { combatant, message } = rollInitiative(store, seat, fixed(10), {
      combatantId: valeria.id,
    });
    expect(message).toMatchObject({ kind: 'check', statistic: 'perception' });
    expect(combatant.initiative).toBe(message.roll.total);
    expect(stored(valeria.id).initiative).toBe(message.roll.total);
    expect(message.permissions.default).toBe('observer');
  });

  it("rolls the statistic asked for, and keeps a hidden combatant's roll from players", () => {
    const { seat, combat } = fight('Valeria');
    const goblin = createActor(store, seat, { kind: 'character', name: 'Goblin' });
    const sceneId = combat.sceneId;
    const token = placeToken(store, {
      scene: sceneSchema.parse(store.getDocument(sceneId)),
      actor: goblin,
      size: 1,
      x: 100,
      y: 100,
      hidden: true,
    });
    const sneaky = addCombatant(store, seat, {
      combatId: combat.id,
      tokenId: token.id,
      hidden: true,
    });
    const { message } = rollInitiative(store, seat, fixed(10), {
      combatantId: sneaky.id,
      statistic: 'skill:stealth',
    });
    expect(message.statistic).toBe('skill:stealth');
    expect(message.permissions.default).toBe('none');
  });

  it('rolls again to replace the number, and refuses a non-GM, a missing combatant, an unrollable statistic and an ended combat', () => {
    const { seat, combat, byName } = fight('Valeria');
    const id = byName('Valeria').id;
    rollInitiative(store, seat, fixed(1), { combatantId: id });
    const { combatant } = rollInitiative(store, seat, fixed(20), { combatantId: id });
    expect(combatant.initiative).toBeGreaterThanOrEqual(20);
    expect(() => rollInitiative(store, player(), fixed(1), { combatantId: id })).toThrow(
      'only the GM',
    );
    expect(() =>
      rollInitiative(store, seat, fixed(1), { combatantId: crypto.randomUUID() }),
    ).toThrow('no combatant found');
    expect(() =>
      rollInitiative(store, seat, fixed(1), { combatantId: id, statistic: 'ac' }),
    ).toThrow('cannot be rolled');
    save({ ...combat, status: 'ended' } as BaseDocument);
    expect(() => rollInitiative(store, seat, fixed(1), { combatantId: id })).toThrow(
      'has ended',
    );
  });
});

describe('setInitiative', () => {
  it('sets, allows a fractional number, and clears with null', () => {
    const { seat, byName, stored } = fight('Valeria');
    const id = byName('Valeria').id;
    expect(
      setInitiative(store, seat, { combatantId: id, initiative: 14.5 }).initiative,
    ).toBe(14.5);
    expect(stored(id).initiative).toBe(14.5);
    expect(
      setInitiative(store, seat, { combatantId: id, initiative: null }).initiative,
    ).toBeUndefined();
    expect(stored(id).initiative).toBeUndefined();
  });

  it('is the GM only', () => {
    const { byName } = fight('Valeria');
    expect(() =>
      setInitiative(store, player(), {
        combatantId: byName('Valeria').id,
        initiative: 5,
      }),
    ).toThrow('only the GM');
  });
});

describe('moveCombatant', () => {
  it('puts a combatant between two others by taking a number between theirs', () => {
    const { seat, byName, stored } = fight('A', 'B', 'C');
    for (const [name, initiative] of [
      ['A', 20],
      ['B', 15],
      ['C', 10],
    ] as const) {
      setInitiative(store, seat, { combatantId: byName(name).id, initiative });
    }
    const changed = moveCombatant(store, seat, {
      combatantId: byName('C').id,
      beforeId: byName('B').id,
    });
    expect(changed.map((c) => [c.id, c.initiative])).toEqual([[byName('C').id, 17.5]]);
    expect(stored(byName('C').id).initiative).toBe(17.5);
  });

  it('moves to the end when no place is given', () => {
    const { seat, byName } = fight('A', 'B');
    setInitiative(store, seat, { combatantId: byName('A').id, initiative: 20 });
    setInitiative(store, seat, { combatantId: byName('B').id, initiative: 10 });
    const changed = moveCombatant(store, seat, { combatantId: byName('A').id });
    expect(changed[0]?.initiative).toBe(9);
  });

  it('changes nothing when it is already there', () => {
    const { seat, byName } = fight('A', 'B');
    setInitiative(store, seat, { combatantId: byName('A').id, initiative: 20 });
    setInitiative(store, seat, { combatantId: byName('B').id, initiative: 10 });
    expect(
      moveCombatant(store, seat, {
        combatantId: byName('A').id,
        beforeId: byName('B').id,
      }),
    ).toEqual([]);
  });

  it('refuses a place among the unrolled, a stranger, a non-GM and an ended combat', () => {
    const { seat, combat, byName, stored } = fight('A', 'B', 'C', 'D');
    setInitiative(store, seat, { combatantId: byName('A').id, initiative: 20 });
    // Unrolled combatants sort by when they joined, so make that order certain: B, C, D.
    ['B', 'C', 'D'].forEach((name, index) => {
      save({
        ...stored(byName(name).id),
        createdAt: `2026-10-01T00:00:0${index}.000Z`,
      });
    });
    expect(() =>
      moveCombatant(store, seat, {
        combatantId: byName('A').id,
        beforeId: byName('D').id,
      }),
    ).toThrow('cannot place it there');
    expect(() =>
      moveCombatant(store, seat, {
        combatantId: byName('A').id,
        beforeId: crypto.randomUUID(),
      }),
    ).toThrow('not in this combat');
    expect(() => moveCombatant(store, player(), { combatantId: byName('A').id })).toThrow(
      'only the GM',
    );
    save({ ...combat, status: 'ended' } as BaseDocument);
    expect(() => moveCombatant(store, seat, { combatantId: byName('A').id })).toThrow(
      'has ended',
    );
  });
});

/** Sets the conditions an actor bears. */
function bear(actorId: string, conditions: unknown[]): void {
  const actor = actorSchema.parse(store.getDocument(actorId));
  save({ ...actor, system: { ...(actor.system as object), conditions } } as BaseDocument);
}

const conditionsOf = (actorId: string): { slug: string }[] =>
  (
    actorSchema.parse(store.getDocument(actorId)).system as {
      conditions: { slug: string }[];
    }
  ).conditions;

describe('startCombat', () => {
  it('rolls the unrolled, keeps a preset number, and gives round 1 to the top of the order', () => {
    const { seat, combat, byName, stored } = fight('A', 'B');
    setInitiative(store, seat, { combatantId: byName('A').id, initiative: 1000 });
    const { documents } = startCombat(store, seat, fixed(10), { combatId: combat.id });

    expect(stored(byName('A').id).initiative).toBe(1000);
    expect(stored(byName('B').id).initiative).toBeGreaterThanOrEqual(10);
    expect(combatSchema.parse(store.getDocument(combat.id))).toMatchObject({
      status: 'active',
      round: 1,
      activeCombatantId: byName('A').id,
    });
    expect(documents.map((doc) => doc.id)).toContain(combat.id);
  });

  it('makes the combat and its visible combatants readable, but not a hidden one', () => {
    const { seat, combat, byName } = fight('A', 'B');
    const hidden = {
      ...byName('B'),
      hidden: true,
      permissions: combatantPermissions('pending', true),
    };
    save(hidden);
    startCombat(store, seat, fixed(10), { combatId: combat.id });

    const viewer = player();
    expect(canReadDocument(viewer, store.getDocument(combat.id) as BaseDocument)).toBe(
      true,
    );
    expect(
      canReadDocument(viewer, store.getDocument(byName('A').id) as BaseDocument),
    ).toBe(true);
    expect(
      canReadDocument(viewer, store.getDocument(byName('B').id) as BaseDocument),
    ).toBe(false);
  });

  it("applies the first combatant's start of turn: stunned costs actions, and the table is told", () => {
    const { seat, combat, byName, stored } = fight('A', 'B');
    setInitiative(store, seat, { combatantId: byName('A').id, initiative: 1000 });
    bear(byName('A').actorId, [{ slug: 'stunned', value: 1 }]);
    const { documents } = startCombat(store, seat, fixed(10), { combatId: combat.id });

    expect(stored(byName('A').id).turn.actionsSpent).toBe(1);
    expect(conditionsOf(byName('A').actorId)).toEqual([]);
    const text = documents.find((doc) => (doc as { kind?: string }).kind === 'text') as {
      text?: string;
    };
    expect(text.text).toContain('loses 1 action(s) to stunned');
  });

  it('leaves a combatant that cannot roll unrolled, rather than refusing the start', () => {
    const { seat, scene, put } = setup();
    put('Valeria');
    const trap = createActor(store, seat, { kind: 'hazard', name: 'Trap' });
    placeToken(store, { scene, actor: trap, size: 1, x: 100, y: 100 });
    const { combat, combatants } = createCombat(store, seat, { sceneId: scene.id });
    startCombat(store, seat, fixed(10), { combatId: combat.id });
    const rolled = combatants.map((c) => combatantSchema.parse(store.getDocument(c.id)));
    expect(rolled.filter((c) => c.initiative === undefined)).toHaveLength(1);
  });

  it('refuses an empty combat', () => {
    const { seat, scene } = setup();
    const { combat } = createCombat(store, seat, { sceneId: scene.id });
    expect(() => startCombat(store, seat, fixed(10), { combatId: combat.id })).toThrow(
      'nobody can take a turn',
    );
  });

  it('refuses a started or ended combat, and a non-GM', () => {
    const { seat, combat } = fight('A');
    expect(() =>
      startCombat(store, player(), fixed(10), { combatId: combat.id }),
    ).toThrow('only the GM');
    startCombat(store, seat, fixed(10), { combatId: combat.id });
    expect(() => startCombat(store, seat, fixed(10), { combatId: combat.id })).toThrow(
      'already started',
    );
    endCombat(store, seat, { combatId: combat.id });
    expect(() => startCombat(store, seat, fixed(10), { combatId: combat.id })).toThrow(
      'has ended',
    );
  });
});

describe('endCombat', () => {
  it('clears the pointer and grants, ends turn-anchored conditions, and frees the one-combat rule', () => {
    const { seat, combat, byName, stored } = fight('A', 'B');
    startCombat(store, seat, fixed(10), { combatId: combat.id });
    const a = byName('A');
    save({ ...stored(a.id), movementGrant: true } as BaseDocument);
    bear(byName('B').actorId, [
      { slug: 'grabbed', duration: { type: 'turn', combatantId: a.id, boundary: 'end' } },
      { slug: 'frightened', value: 1 },
    ]);

    const { documents } = endCombat(store, seat, { combatId: combat.id });
    const ended = combatSchema.parse(store.getDocument(combat.id));
    expect(ended.status).toBe('ended');
    expect(ended.activeCombatantId).toBeUndefined();
    expect(stored(a.id).movementGrant).toBe(false);
    expect(conditionsOf(byName('B').actorId).map((c) => c.slug)).toEqual(['frightened']);
    expect(documents.map((doc) => doc.id)).toContain(combat.id);
    expect(canReadDocument(player(), ended)).toBe(true);
    expect(() => createCombat(store, seat, { sceneId: ended.sceneId })).not.toThrow();
  });

  it('keeps a combat that never began hidden, and is the GM only', () => {
    const { seat, combat } = fight('A');
    expect(() => endCombat(store, player(), { combatId: combat.id })).toThrow(
      'only the GM',
    );
    endCombat(store, seat, { combatId: combat.id });
    const ended = combatSchema.parse(store.getDocument(combat.id));
    expect(ended.status).toBe('ended');
    expect(canReadDocument(player(), ended)).toBe(false);
    expect(() => endCombat(store, seat, { combatId: combat.id })).toThrow('has ended');
  });
});

describe('joinCombat', () => {
  it('only adds to a pending combat, but rolls at once in a running one', () => {
    const { seat, scene, put } = setup();
    put('Valeria');
    const { combat } = createCombat(store, seat, { sceneId: scene.id });
    const early = put('Early');
    const pending = joinCombat(store, seat, fixed(10), {
      combatId: combat.id,
      tokenId: early.token.id,
    });
    expect(pending.documents).toHaveLength(1);
    expect((pending.documents[0] as Combatant).initiative).toBeUndefined();

    startCombat(store, seat, fixed(10), { combatId: combat.id });
    const late = put('Late');
    const running = joinCombat(store, seat, fixed(10), {
      combatId: combat.id,
      tokenId: late.token.id,
    });
    expect(running.documents).toHaveLength(2);
    expect((running.documents[0] as Combatant).initiative).toBeGreaterThanOrEqual(10);
  });
});

/** A started two-combatant fight: A (initiative 20) is active in round 1, B (10) is next. */
function running() {
  const f = fight('A', 'B');
  setInitiative(store, f.seat, { combatantId: f.byName('A').id, initiative: 20 });
  setInitiative(store, f.seat, { combatantId: f.byName('B').id, initiative: 10 });
  startCombat(store, f.seat, fixed(10), { combatId: f.combat.id });
  const now = () => combatSchema.parse(store.getDocument(f.combat.id));
  return { ...f, now };
}

describe('nextTurn', () => {
  it('passes the turn down the order and counts a new round when it wraps', () => {
    const { seat, combat, byName, now } = running();
    nextTurn(store, seat, { combatId: combat.id });
    expect(now()).toMatchObject({ round: 1, activeCombatantId: byName('B').id });
    nextTurn(store, seat, { combatId: combat.id });
    expect(now()).toMatchObject({ round: 2, activeCombatantId: byName('A').id });
  });

  it("runs the leaving combatant's end of turn and the arriving one's start, and says so", () => {
    const { seat, combat, byName, stored } = running();
    bear(byName('A').actorId, [{ slug: 'frightened', value: 2 }]);
    bear(byName('B').actorId, [{ slug: 'stunned', value: 1 }]);
    save({
      ...stored(byName('B').id),
      turn: { actionsSpent: 2, reactionUsed: true, attacksMade: 2 },
    } as BaseDocument);

    const { documents } = nextTurn(store, seat, { combatId: combat.id });
    expect(conditionsOf(byName('A').actorId)).toEqual([{ slug: 'frightened', value: 1 }]);
    expect(conditionsOf(byName('B').actorId)).toEqual([]);
    expect(stored(byName('B').id).turn).toEqual({
      actionsSpent: 1,
      reactionUsed: false,
      attacksMade: 0,
      movementUsed: 0,
    });
    const text = documents.find(
      (doc) => (doc as { kind?: string }).kind === 'text',
    ) as unknown as {
      text: string;
    };
    expect(text.text).toContain('frightened on A drops from 2 to 1');
    expect(text.text).toContain('loses 1 action(s) to stunned');
  });

  it("spends the leaving combatant's one-off movement grant", () => {
    const { seat, combat, byName, stored } = running();
    save({ ...stored(byName('A').id), movementGrant: true } as BaseDocument);
    nextTurn(store, seat, { combatId: combat.id });
    expect(stored(byName('A').id).movementGrant).toBe(false);
  });

  it('skips a defeated combatant', () => {
    const { seat, combat, byName, stored, now } = running();
    save({ ...stored(byName('B').id), defeated: true } as BaseDocument);
    nextTurn(store, seat, { combatId: combat.id });
    expect(now()).toMatchObject({ round: 2, activeCombatantId: byName('A').id });
  });

  it('goes to the top of the order without a new round when the active combatant is gone', () => {
    const { seat, combat, byName, now } = running();
    store.deleteDocument(byName('A').tokenId);
    cascadeCombatDeletion(store, [{ id: byName('A').tokenId } as BaseDocument]);
    expect(now().activeCombatantId).toBeUndefined();
    nextTurn(store, seat, { combatId: combat.id });
    expect(now()).toMatchObject({ round: 1, activeCombatantId: byName('B').id });
  });

  it('is refused for a pending combat', () => {
    const { seat, combat } = fight('A');
    expect(() => nextTurn(store, seat, { combatId: combat.id })).toThrow(
      'has not started',
    );
    expect(() => previousTurn(store, seat, { combatId: combat.id })).toThrow(
      'has not started',
    );
  });

  it('is refused for an ended combat, and for a player who owns nothing in it', () => {
    const { seat, combat } = running();
    expect(() => nextTurn(store, player(), { combatId: combat.id })).toThrow(
      'permission',
    );
    endCombat(store, seat, { combatId: combat.id });
    expect(() => nextTurn(store, seat, { combatId: combat.id })).toThrow('has ended');
  });

  it("lets the active combatant's own owner end their own turn (the player's End turn)", () => {
    const { combat, byName, now } = running();
    const activeActor = actorSchema.parse(store.getDocument(byName('A').actorId));
    const owner = player();
    save({
      ...activeActor,
      permissions: {
        ...activeActor.permissions,
        seats: { ...activeActor.permissions.seats, [owner.id]: 'owner' },
      },
    });

    nextTurn(store, owner, { combatId: combat.id });
    expect(now()).toMatchObject({ round: 1, activeCombatantId: byName('B').id });
  });

  it("refuses a player who owns B's actor while A is active -- only the active combatant's owner may end it", () => {
    const { combat, byName } = running();
    const bActor = actorSchema.parse(store.getDocument(byName('B').actorId));
    const bOwner = player();
    save({
      ...bActor,
      permissions: {
        ...bActor.permissions,
        seats: { ...bActor.permissions.seats, [bOwner.id]: 'owner' },
      },
    });

    expect(() => nextTurn(store, bOwner, { combatId: combat.id })).toThrow('permission');
  });
});

describe('previousTurn', () => {
  it('steps back, and back a round when it wraps, without undoing conditions', () => {
    const { seat, combat, byName, now } = running();
    nextTurn(store, seat, { combatId: combat.id });
    nextTurn(store, seat, { combatId: combat.id });
    expect(now()).toMatchObject({ round: 2, activeCombatantId: byName('A').id });
    previousTurn(store, seat, { combatId: combat.id });
    expect(now()).toMatchObject({ round: 1, activeCombatantId: byName('B').id });
    previousTurn(store, seat, { combatId: combat.id });
    expect(now()).toMatchObject({ round: 1, activeCombatantId: byName('A').id });
  });

  it('does not undo what a boundary changed', () => {
    const { seat, combat, byName } = running();
    bear(byName('A').actorId, [{ slug: 'frightened', value: 2 }]);
    nextTurn(store, seat, { combatId: combat.id });
    previousTurn(store, seat, { combatId: combat.id });
    expect(conditionsOf(byName('A').actorId)).toEqual([{ slug: 'frightened', value: 1 }]);
  });

  it('is refused at the first turn of round 1, and for a non-GM', () => {
    const { seat, combat } = running();
    expect(() => previousTurn(store, seat, { combatId: combat.id })).toThrow(
      'first turn',
    );
    expect(() => previousTurn(store, player(), { combatId: combat.id })).toThrow(
      'only the GM',
    );
  });
});
