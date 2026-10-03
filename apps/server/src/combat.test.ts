import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, BaseDocument, Combatant, Seat, Token } from '@hearthtable/core';
import {
  actorSchema,
  combatantSchema,
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
  moveCombatant,
  removeCombatant,
  rollInitiative,
  setInitiative,
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
    const { seat, combat, byName } = fight('A', 'B', 'C');
    setInitiative(store, seat, { combatantId: byName('A').id, initiative: 20 });
    expect(() =>
      moveCombatant(store, seat, {
        combatantId: byName('A').id,
        beforeId: byName('C').id,
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
