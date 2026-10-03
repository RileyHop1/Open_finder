import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import { characterDataSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, updateActor } from './actors.js';
import { createCombat, nextTurn, setInitiative, startCombat } from './combat.js';
import { settlePersistentDamage } from './persistentDamage.js';
import { createScene } from './scenes.js';
import { placeToken } from './tokens.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-persistent-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-01T00:00:00.000Z';
const definitions = new Map();

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

/** A rng that returns the given values in order, so each die in a test is a known number. */
const sequence = (...values: number[]): RandomSource => {
  let next = 0;
  return () => values[next++] ?? 1;
};

const sheet = (actorId: string) =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

type Burn = { formula: string; damageType: string };

/** A level 1 character with 18 maximum hit points, at `current`, carrying `burning`. */
function burning(burns: Burn[], current = 18) {
  const gm = makeSeat();
  const actor = createActor(store, gm, { kind: 'character', name: 'Ada' });
  updateActor(store, gm, {
    actorId: actor.id,
    changes: {
      'system.ancestryHp': 8,
      'system.classHp': 10,
      'system.hp.current': current,
    },
  });
  const stored = actorSchema.parse(store.getDocument(actor.id));
  store.putDocument({
    ...stored,
    system: {
      ...stored.system,
      persistentDamage: burns.map((burn) => ({ id: crypto.randomUUID(), ...burn })),
    },
  } as Actor);
  const scene = createScene(store, gm, { name: 'Crypt', kind: 'battle' });
  placeToken(store, { scene, actor, size: 1, x: 350, y: 450 });
  const bystander = createActor(store, gm, { kind: 'character', name: 'Ben' });
  placeToken(store, { scene, actor: bystander, size: 1, x: 450, y: 450 });
  const { combat, combatants } = createCombat(store, gm, { sceneId: scene.id });
  const combatant = combatants.find((c) => c.actorId === actor.id)!;
  const other = combatants.find((c) => c.actorId === bystander.id)!;
  return { gm, actorId: actor.id, combat, combatant, other };
}

const settle = (gm: Seat, combatantId: string, rng: RandomSource) =>
  settlePersistentDamage(store, gm, rng, definitions, { combatantId });

describe('settlePersistentDamage', () => {
  it('rolls the damage, applies it, and keeps the entry when the flat check fails', () => {
    const { gm, actorId, combatant } = burning([{ formula: '1d6', damageType: 'fire' }]);
    const { documents } = settle(gm, combatant.id, sequence(4, 12));
    expect(sheet(actorId).hp.current).toBe(14);
    expect(sheet(actorId).persistentDamage).toHaveLength(1);
    const kinds = documents.map((d) => (d as { kind?: string }).kind);
    expect(kinds).toEqual(expect.arrayContaining(['roll', 'check', 'text']));
    expect(JSON.stringify(documents)).toContain('still taking persistent fire damage');
  });

  it('ends the entry on a natural 15', () => {
    const { gm, actorId, combatant } = burning([{ formula: '1d6', damageType: 'fire' }]);
    settle(gm, combatant.id, sequence(2, 15));
    expect(sheet(actorId).persistentDamage).toEqual([]);
  });

  it('keeps the entry on a natural 14', () => {
    const { gm, actorId, combatant } = burning([{ formula: '1d6', damageType: 'fire' }]);
    settle(gm, combatant.id, sequence(2, 14));
    expect(sheet(actorId).persistentDamage).toHaveLength(1);
  });

  it('settles each entry on its own: damage then flat check, in order', () => {
    const { gm, actorId, combatant } = burning([
      { formula: '1d6', damageType: 'fire' },
      { formula: '1d4', damageType: 'bleed' },
    ]);
    settle(gm, combatant.id, sequence(3, 16, 2, 5));
    expect(sheet(actorId).hp.current).toBe(18 - 3 - 2);
    expect(sheet(actorId).persistentDamage.map((e) => e.damageType)).toEqual(['bleed']);
  });

  it('puts a character at 0 hit points through the dying chain', () => {
    const { gm, actorId, combatant } = burning(
      [{ formula: '1d6', damageType: 'fire' }],
      3,
    );
    settle(gm, combatant.id, sequence(6, 20));
    const data = sheet(actorId);
    expect(data.hp.current).toBe(0);
    expect(data.conditions.find((c) => c.slug === 'dying')?.value).toBe(1);
    expect(data.persistentDamage).toEqual([]);
  });

  it('shows the card to players only when the actor is public', () => {
    const { gm, actorId, combatant } = burning([{ formula: '1d6', damageType: 'fire' }]);
    const actor = actorSchema.parse(store.getDocument(actorId));
    store.putDocument({ ...actor, permissions: { default: 'none', seats: {} } });
    const { documents } = settle(gm, combatant.id, sequence(4, 12));
    const chat = documents.filter((d) => d.type === 'chatMessage');
    expect(chat.length).toBeGreaterThan(0);
    expect(chat.every((d) => d.permissions.default === 'none')).toBe(true);
  });

  it('does nothing for a combatant who carries no persistent damage', () => {
    const { gm, combatant } = burning([]);
    expect(settle(gm, combatant.id, sequence(4, 12)).documents).toEqual([]);
  });
});

describe('ending a turn', () => {
  it('reports whose turn ended, so the persistent damage can be settled', () => {
    const { gm, combat, combatant, other } = burning([
      { formula: '1d6', damageType: 'fire' },
    ]);
    setInitiative(store, gm, { combatantId: combatant.id, initiative: 20 });
    setInitiative(store, gm, { combatantId: other.id, initiative: 10 });
    startCombat(store, gm, () => 10, { combatId: combat.id });
    expect(nextTurn(store, gm, { combatId: combat.id }).endedTurnOf).toBe(combatant.id);
  });
});
