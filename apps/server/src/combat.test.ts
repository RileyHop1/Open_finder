import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, BaseDocument, Seat, Token } from '@hearthtable/core';
import { actorSchema, combatantSchema, combatSchema } from '@hearthtable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import {
  addCombatant,
  combatantPermissions,
  combatPermissions,
  createCombat,
  removeCombatant,
} from './combat.js';
import { addPartyMember } from './party.js';
import { createScene } from './scenes.js';
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
