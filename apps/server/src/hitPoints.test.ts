import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Actor, Seat } from '@hearthtable/core';
import { actorSchema, combatantSchema } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import type { CreatureEntry } from '@hearthtable/pf2e';
import {
  characterDataSchema,
  newNpcFromCreature,
  npcDataSchema,
} from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, updateActor } from './actors.js';
import {
  createCombat,
  nextTurn,
  recoverActive,
  setInitiative,
  startCombat,
} from './combat.js';
import { applyDamageToActor, healActor, rollRecovery } from './hitPoints.js';
import { createScene } from './scenes.js';
import { placeToken } from './tokens.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-hp-test-'));
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

const dataOf = (actorId: string) =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

const slugs = (actorId: string): string[] =>
  dataOf(actorId).conditions.map((c) => c.slug);
const valueOf = (actorId: string, slug: string): number =>
  dataOf(actorId).conditions.find((c) => c.slug === slug)?.value ?? 0;

/** A level 1 character with 18 maximum hit points (8 ancestry + 10 class, Con +0), at `current`. */
function hero(options: { current?: number; temp?: number; conditions?: unknown[] } = {}) {
  const owner = makeSeat();
  const actor = createActor(store, owner, { kind: 'character', name: 'Ada' });
  updateActor(store, owner, {
    actorId: actor.id,
    changes: {
      'system.ancestryHp': 8,
      'system.classHp': 10,
      'system.hp.current': options.current ?? 18,
      'system.hp.temp': options.temp ?? 0,
    },
  });
  if (options.conditions !== undefined) {
    const sheet = actorSchema.parse(store.getDocument(actor.id));
    store.putDocument({
      ...sheet,
      system: { ...sheet.system, conditions: options.conditions },
    } as Actor);
  }
  return { owner, actorId: actor.id };
}

const damage = (owner: Seat, actorId: string, amount: number, critical = false) =>
  applyDamageToActor(store, owner, definitions, { actorId, amount, critical });

describe('applyDamageToActor on a character', () => {
  it('only lowers hit points while the character stays above 0', () => {
    const { owner, actorId } = hero();
    const { documents } = damage(owner, actorId, 5);
    expect(dataOf(actorId).hp.current).toBe(13);
    expect(slugs(actorId)).toEqual([]);
    expect(documents).toHaveLength(1);
  });

  it('knocks a character out at 0: unconscious and dying 1, and tells the table', () => {
    const { owner, actorId } = hero({ current: 5 });
    const { documents } = damage(owner, actorId, 7);
    expect(dataOf(actorId).hp.current).toBe(0);
    expect(valueOf(actorId, 'dying')).toBe(1);
    expect(slugs(actorId)).toContain('unconscious');
    expect(JSON.stringify(documents)).toContain('Ada is knocked out and dying 1.');
  });

  it('knocks out at dying 2 on a critical, and at one more for each wound', () => {
    const crit = hero({ current: 5 });
    damage(crit.owner, crit.actorId, 7, true);
    expect(valueOf(crit.actorId, 'dying')).toBe(2);

    const wounded = hero({ current: 5, conditions: [{ slug: 'wounded', value: 1 }] });
    damage(wounded.owner, wounded.actorId, 7);
    expect(valueOf(wounded.actorId, 'dying')).toBe(2);
  });

  it('raises dying when damage lands at 0, by 2 on a critical, and knocks a stable character out again', () => {
    const { owner, actorId } = hero({
      current: 0,
      conditions: [{ slug: 'dying', value: 1 }, { slug: 'unconscious' }],
    });
    damage(owner, actorId, 3);
    expect(valueOf(actorId, 'dying')).toBe(2);

    const stable = hero({ current: 0, conditions: [{ slug: 'unconscious' }] });
    damage(stable.owner, stable.actorId, 3);
    expect(valueOf(stable.actorId, 'dying')).toBe(1);
  });

  it('kills at dying 4, marking the character dead', () => {
    const { owner, actorId } = hero({
      current: 0,
      conditions: [{ slug: 'dying', value: 3 }, { slug: 'unconscious' }],
    });
    const { documents } = damage(owner, actorId, 1);
    expect(slugs(actorId)).toContain('dead');
    expect(JSON.stringify(documents)).toContain('Ada dies.');
  });

  it('lets doomed lower the dying value that kills', () => {
    const { owner, actorId } = hero({
      current: 0,
      conditions: [
        { slug: 'dying', value: 2 },
        { slug: 'doomed', value: 1 },
        { slug: 'unconscious' },
      ],
    });
    damage(owner, actorId, 1);
    expect(slugs(actorId)).toContain('dead');
  });

  it('kills outright when the damage left after 0 is at least the maximum', () => {
    const near = hero({ current: 5 });
    damage(near.owner, near.actorId, 5 + 18);
    expect(slugs(near.actorId)).toContain('dead');

    const falling = hero({ current: 5 });
    damage(falling.owner, falling.actorId, 5 + 17);
    expect(slugs(falling.actorId)).not.toContain('dead');
  });

  it('lets temporary hit points absorb damage before the chain starts', () => {
    const absorbed = hero({ current: 5, temp: 8 });
    damage(absorbed.owner, absorbed.actorId, 8);
    expect(dataOf(absorbed.actorId).hp).toMatchObject({ current: 5, temp: 0 });
    expect(slugs(absorbed.actorId)).toEqual([]);

    const through = hero({ current: 5, temp: 3 });
    damage(through.owner, through.actorId, 8);
    expect(dataOf(through.actorId).hp.current).toBe(0);
    expect(valueOf(through.actorId, 'dying')).toBe(1);
  });

  it('does not run the chain for a character who is already dead, nor for zero damage', () => {
    const dead = hero({ current: 0, conditions: [{ slug: 'dead' }] });
    damage(dead.owner, dead.actorId, 4);
    expect(slugs(dead.actorId)).toEqual(['dead']);
    const idle = hero({ current: 0, conditions: [{ slug: 'unconscious' }] });
    damage(idle.owner, idle.actorId, 0);
    expect(valueOf(idle.actorId, 'dying')).toBe(0);
  });
});

describe('healActor on a character', () => {
  it('ends dying and unconsciousness when healed above 0, and raises wounded', () => {
    const { owner, actorId } = hero({
      current: 0,
      conditions: [{ slug: 'dying', value: 2 }, { slug: 'unconscious' }],
    });
    const { documents } = healActor(store, owner, definitions, { actorId, amount: 5 });
    expect(dataOf(actorId).hp.current).toBe(5);
    expect(slugs(actorId)).toEqual(['wounded']);
    expect(valueOf(actorId, 'wounded')).toBe(1);
    expect(JSON.stringify(documents)).toContain('back on their feet');
  });

  it('only wakes a stable character, without raising wounded', () => {
    const { owner, actorId } = hero({
      current: 0,
      conditions: [{ slug: 'unconscious' }],
    });
    healActor(store, owner, definitions, { actorId, amount: 1 });
    expect(slugs(actorId)).toEqual([]);
  });

  it('never heals above the maximum, and leaves a healthy character alone', () => {
    const { owner, actorId } = hero({ current: 15 });
    healActor(store, owner, definitions, { actorId, amount: 50 });
    expect(dataOf(actorId).hp.current).toBe(18);
    expect(slugs(actorId)).toEqual([]);
  });

  it('refuses to heal the dead', () => {
    const { owner, actorId } = hero({ current: 0, conditions: [{ slug: 'dead' }] });
    expect(() => healActor(store, owner, definitions, { actorId, amount: 5 })).toThrow(
      'is dead',
    );
  });
});

describe('ownership', () => {
  it('lets the owner or the GM change hit points, and reports anyone else as not found', () => {
    const { owner, actorId } = hero();
    const gm = makeSeat({ name: 'GM', isGM: true });
    expect(() => damage(gm, actorId, 1)).not.toThrow();
    expect(() => damage(owner, actorId, 1)).not.toThrow();
    expect(() => damage(makeSeat(), actorId, 1)).toThrow();
    expect(() => damage(owner, crypto.randomUUID(), 1)).toThrow('no actor found');
  });
});

function goblin(): CreatureEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'bestiary',
    slug: 'invented-goblin',
    name: 'Invented Goblin',
    kind: 'creature',
    provenance: {
      publication: 'Pathfinder Monster Core',
      license: 'ORC',
      remaster: true,
    },
    traits: [],
    ruleElements: [],
    description: '',
    level: 1,
    size: 'small',
    perception: 5,
    ac: 16,
    savingThrows: { fortitude: 5, reflex: 7, will: 3 },
    hp: 18,
    resistances: [],
    weaknesses: [],
    speeds: { land: 25 },
    attributes: { str: 0, dex: 3, con: 1, int: -1, wis: 0, cha: -1 },
    skills: {},
    strikes: [],
    languages: [],
  };
}

describe('a monster', () => {
  function monsterInCombat() {
    const gm = makeSeat({ name: 'GM', isGM: true });
    const scene = createScene(store, gm, { name: 'Crypt', kind: 'battle' });
    const now = new Date().toISOString();
    const actor = actorSchema.parse({
      id: crypto.randomUUID(),
      worldId: store.world.id,
      type: 'actor',
      schemaVersion: 1,
      permissions: { default: 'none', seats: {} },
      createdAt: now,
      updatedAt: now,
      kind: 'npc',
      name: 'Goblin',
      system: { ...newNpcFromCreature(goblin()) },
    });
    store.putDocument(actor);
    placeToken(store, { scene, actor, size: 1, x: 350, y: 450 });
    const { combat, combatants } = createCombat(store, gm, { sceneId: scene.id });
    startCombat(store, gm, fixed(10), { combatId: combat.id });
    const stored = () => combatantSchema.parse(store.getDocument(combatants[0]!.id));
    return { gm, actor, stored };
  }

  it('is marked defeated at 0 in an active combat, and restored when healed', () => {
    const { gm, actor, stored } = monsterInCombat();
    const { documents } = applyDamageToActor(store, gm, definitions, {
      actorId: actor.id,
      amount: 40,
    });
    expect(
      npcDataSchema.parse(actorSchema.parse(store.getDocument(actor.id)).system).hp
        .current,
    ).toBe(0);
    expect(stored().defeated).toBe(true);
    expect(JSON.stringify(documents)).toContain('Goblin is defeated.');
    const chat = documents.find((d) => (d as { kind?: string }).kind === 'text');
    expect(chat?.permissions.default).toBe('none');

    healActor(store, gm, definitions, { actorId: actor.id, amount: 5 });
    expect(stored().defeated).toBe(false);
  });

  it('runs no dying chain, and only loses hit points above 0', () => {
    const { gm, actor, stored } = monsterInCombat();
    applyDamageToActor(store, gm, definitions, { actorId: actor.id, amount: 5 });
    expect(stored().defeated).toBe(false);
    const data = npcDataSchema.parse(
      actorSchema.parse(store.getDocument(actor.id)).system,
    );
    expect(data.hp.current).toBe(13);
    expect(data.conditions).toEqual([]);
  });
});

describe('rollRecovery', () => {
  const gm = () => makeSeat({ name: 'GM', isGM: true });
  const dyingHero = (value: number, extra: unknown[] = []) =>
    hero({
      current: 0,
      conditions: [{ slug: 'dying', value }, { slug: 'unconscious' }, ...extra],
    });
  const recover = (actorId: string, face: number) =>
    rollRecovery(store, gm(), fixed(face), definitions, { actorId });

  it('stabilises on a success: dying ends, wounded rises, the character stays unconscious', () => {
    const { actorId } = dyingHero(1);
    const { documents } = recover(actorId, 11);
    expect(valueOf(actorId, 'dying')).toBe(0);
    expect(valueOf(actorId, 'wounded')).toBe(1);
    expect(slugs(actorId)).toContain('unconscious');
    expect(JSON.stringify(documents)).toContain('Ada is stable.');
  });

  it('raises dying on a failure, and kills at the death threshold', () => {
    const { actorId } = dyingHero(2);
    recover(actorId, 10);
    expect(valueOf(actorId, 'dying')).toBe(3);
    recover(actorId, 10);
    expect(slugs(actorId)).toContain('dead');
  });

  it('moves dying by two on a critical, either way', () => {
    const good = dyingHero(2);
    recover(good.actorId, 20);
    expect(valueOf(good.actorId, 'dying')).toBe(0);
    const bad = dyingHero(1);
    recover(bad.actorId, 1);
    expect(valueOf(bad.actorId, 'dying')).toBe(3);
  });

  it('posts a flat check card against DC 10 plus dying, kept from players when the actor is not public', () => {
    const { actorId } = dyingHero(2);
    const sheet = actorSchema.parse(store.getDocument(actorId));
    store.putDocument({ ...sheet, permissions: { default: 'none', seats: {} } });
    const { documents } = recover(actorId, 12);
    const card = documents.find((d) => (d as { kind?: string }).kind === 'check');
    expect(card).toMatchObject({ statistic: 'recovery', dc: 12 });
    expect(card?.permissions.default).toBe('none');
  });

  it('is GM only, and refuses a character who is not dying, and a dead one', () => {
    const { owner, actorId } = dyingHero(1);
    expect(() => rollRecovery(store, owner, fixed(11), definitions, { actorId })).toThrow(
      'only the GM',
    );
    const healthy = hero();
    expect(() => recover(healthy.actorId, 11)).toThrow('not dying');
    const dead = dyingHero(1, [{ slug: 'dead' }]);
    expect(() => recover(dead.actorId, 11)).toThrow('not dying');
  });
});

describe('the recovery check at the start of a turn', () => {
  function dyingInCombat() {
    const gm = makeSeat({ name: 'GM', isGM: true });
    const scene = createScene(store, gm, { name: 'Crypt', kind: 'battle' });
    const fighter = hero();
    const downed = hero({
      current: 0,
      conditions: [{ slug: 'dying', value: 1 }, { slug: 'unconscious' }],
    });
    const tokenFor = (actorId: string) => {
      const actor = actorSchema.parse(store.getDocument(actorId));
      return placeToken(store, { scene, actor, size: 1, x: 350, y: 450 });
    };
    tokenFor(fighter.actorId);
    tokenFor(downed.actorId);
    const { combat, combatants } = createCombat(store, gm, { sceneId: scene.id });
    const of = (actorId: string) => combatants.find((c) => c.actorId === actorId)!;
    return { gm, combat, fighter, downed, of };
  }

  it('rolls for a dying character whose turn is arriving, after nextTurn', () => {
    const { gm, combat, fighter, downed, of } = dyingInCombat();
    setInitiative(store, gm, { combatantId: of(fighter.actorId).id, initiative: 20 });
    setInitiative(store, gm, { combatantId: of(downed.actorId).id, initiative: 10 });
    startCombat(store, gm, fixed(10), { combatId: combat.id });

    nextTurn(store, gm, { combatId: combat.id });
    const { documents } = recoverActive(store, gm, fixed(11), definitions, {
      combatId: combat.id,
    });
    expect(documents.some((d) => (d as { kind?: string }).kind === 'check')).toBe(true);
    expect(valueOf(downed.actorId, 'dying')).toBe(0);
  });

  it('rolls nothing for a combatant who is not dying', () => {
    const { gm, combat, fighter, downed, of } = dyingInCombat();
    setInitiative(store, gm, { combatantId: of(fighter.actorId).id, initiative: 20 });
    setInitiative(store, gm, { combatantId: of(downed.actorId).id, initiative: 10 });
    startCombat(store, gm, fixed(10), { combatId: combat.id });
    expect(
      recoverActive(store, gm, fixed(11), definitions, { combatId: combat.id }).documents,
    ).toEqual([]);
  });

  it('rolls when the combat starts on a dying character', () => {
    const { gm, combat, fighter, downed, of } = dyingInCombat();
    setInitiative(store, gm, { combatantId: of(downed.actorId).id, initiative: 20 });
    setInitiative(store, gm, { combatantId: of(fighter.actorId).id, initiative: 10 });
    startCombat(store, gm, fixed(10), { combatId: combat.id });
    recoverActive(store, gm, fixed(11), definitions, { combatId: combat.id });
    expect(valueOf(downed.actorId, 'dying')).toBe(0);
  });
});
