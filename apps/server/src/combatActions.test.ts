import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema, combatantSchema } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import type { CharacterData, Pf2eEntry, WeaponEntry } from '@hearthtable/pf2e';
import { characterDataSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, updateActor } from './actors.js';
import {
  createCombat,
  endCombat,
  nextTurn,
  setInitiative,
  spendAction,
  startCombat,
} from './combat.js';
import type { CompendiumIndex } from './compendium.js';
import { addItem, updateItem } from './items.js';
import { createScene } from './scenes.js';
import { rollTrackedStrike } from './strikeRolls.js';
import { placeToken } from './tokens.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-actions-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-01T00:00:00.000Z';

const SWORD: WeaponEntry = {
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'equipment',
  slug: 'invented-sword',
  name: 'Invented Sword',
  kind: 'weapon',
  provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
  traits: [],
  ruleElements: [],
  description: '',
  category: 'martial',
  group: 'sword',
  damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
  hands: 1,
};

const compendium: CompendiumIndex = {
  status: () => ({ available: true, packs: [], entryCount: 1, skipped: 0 }),
  search: () => [],
  get: (packId, slug): Pf2eEntry | undefined =>
    packId === 'equipment' && slug === SWORD.slug ? SWORD : undefined,
  conditions: () => new Map(),
};

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

const sheetOf = (actorId: string): CharacterData =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

/** A swordsman and a bystander in a combat (not started); the swordsman has the higher initiative. */
function fight() {
  const gm = makeSeat({ name: 'GM', isGM: true });
  const scene = createScene(store, gm, { name: 'Crypt', kind: 'battle' });
  const owner = makeSeat({ name: 'Ada' });
  const hero = createActor(store, owner, { kind: 'character', name: 'Ada' });
  updateActor(store, owner, {
    actorId: hero.id,
    changes: { 'system.attributes.str': 4, 'system.ranks.weapons.martial': 'trained' },
  });
  addItem(store, owner, compendium, {
    actorId: hero.id,
    packId: 'equipment',
    slug: SWORD.slug,
  });
  const itemId = sheetOf(hero.id).items[0]?.id ?? '';
  updateItem(store, owner, { actorId: hero.id, itemId, equipped: true });
  const other = createActor(store, gm, { kind: 'character', name: 'Ben' });
  for (const actor of [hero, other]) {
    placeToken(store, { scene, actor, size: 1, x: 350, y: 450 });
  }
  const { combat, combatants } = createCombat(store, gm, { sceneId: scene.id });
  const ada = combatants.find((c) => c.actorId === hero.id)!;
  const ben = combatants.find((c) => c.actorId === other.id)!;
  setInitiative(store, gm, { combatantId: ada.id, initiative: 20 });
  setInitiative(store, gm, { combatantId: ben.id, initiative: 10 });
  const stored = (id: string) => combatantSchema.parse(store.getDocument(id));
  return {
    gm,
    owner,
    hero,
    itemId,
    combat,
    ada,
    ben,
    stored,
    start: () => startCombat(store, gm, fixed(10), { combatId: combat.id }),
  };
}

describe('spendAction', () => {
  it('adds to the actions spent and sets the reaction, for the owner', () => {
    const { owner, ada, stored, start } = fight();
    start();
    spendAction(store, owner, { combatantId: ada.id, actions: 2 });
    spendAction(store, owner, { combatantId: ada.id, actions: 1, reaction: true });
    expect(stored(ada.id).turn).toMatchObject({ actionsSpent: 3, reactionUsed: true });
  });

  it('gives actions back, never below zero, and frees the reaction', () => {
    const { gm, ada, stored, start } = fight();
    start();
    spendAction(store, gm, { combatantId: ada.id, actions: 1, reaction: true });
    spendAction(store, gm, { combatantId: ada.id, actions: -3, reaction: false });
    expect(stored(ada.id).turn).toMatchObject({ actionsSpent: 0, reactionUsed: false });
  });

  it('never blocks an overspend, an off-turn spend, or a second reaction, and warns in chat', () => {
    const { gm, ada, ben, stored, start } = fight();
    start();
    const over = spendAction(store, gm, { combatantId: ada.id, actions: 3 });
    expect(over.documents).toHaveLength(1);
    const { documents } = spendAction(store, gm, { combatantId: ada.id, actions: 1 });
    expect(stored(ada.id).turn.actionsSpent).toBe(4);
    expect(JSON.stringify(documents)).toContain('Ada has spent 4 of 3 actions.');

    spendAction(store, gm, { combatantId: ben.id, reaction: true });
    const again = spendAction(store, gm, { combatantId: ben.id, reaction: true });
    expect(JSON.stringify(again.documents)).toContain('already used a reaction');
  });

  it('counts a slowed combatant against its smaller turn', () => {
    const { gm, hero, ada, start } = fight();
    const sheet = actorSchema.parse(store.getDocument(hero.id));
    store.putDocument({
      ...sheet,
      system: { ...sheet.system, conditions: [{ slug: 'slowed', value: 1 }] },
    } as typeof sheet);
    start();
    const { documents } = spendAction(store, gm, { combatantId: ada.id, actions: 3 });
    expect(JSON.stringify(documents)).toContain('3 of 2 actions');
  });

  it("keeps a hidden combatant's warning from players", () => {
    const { gm, ada, start } = fight();
    store.putDocument({ ...ada, hidden: true } as typeof ada);
    start();
    const { documents } = spendAction(store, gm, { combatantId: ada.id, actions: 4 });
    const text = documents.find((d) => (d as { kind?: string }).kind === 'text');
    expect(text?.permissions.default).toBe('none');
  });

  it("is for the actor's owner or the GM, and only in an active combat", () => {
    const { gm, owner, ada, ben, combat, start } = fight();
    expect(() => spendAction(store, owner, { combatantId: ada.id, actions: 1 })).toThrow(
      'has not started',
    );
    start();
    expect(() => spendAction(store, owner, { combatantId: ben.id, actions: 1 })).toThrow(
      'you do not have permission',
    );
    expect(() =>
      spendAction(store, owner, { combatantId: crypto.randomUUID(), actions: 1 }),
    ).toThrow('no combatant found');
    endCombat(store, gm, { combatId: combat.id });
    expect(() => spendAction(store, owner, { combatantId: ada.id, actions: 1 })).toThrow(
      'has ended',
    );
  });
});

describe('a strike in a combat', () => {
  it('takes its attack number from the tracker and counts the attack', () => {
    const { owner, hero, itemId, ada, stored, start } = fight();
    start();
    const roll = () =>
      rollTrackedStrike(store, owner, fixed(10), { actorId: hero.id, itemId });
    const first = roll();
    expect(first.message.attackNumber).toBe(1);
    expect(first.combatant?.turn.attacksMade).toBe(1);
    expect(roll().message.attackNumber).toBe(2);
    expect(roll().message.attackNumber).toBe(3);
    expect(roll().message.attackNumber).toBe(3);
    expect(stored(ada.id).turn.attacksMade).toBe(4);
  });

  it("starts the count over on the combatant's next turn", () => {
    const { gm, owner, hero, itemId, start, combat } = fight();
    start();
    rollTrackedStrike(store, owner, fixed(10), { actorId: hero.id, itemId });
    nextTurn(store, gm, { combatId: combat.id });
    nextTurn(store, gm, { combatId: combat.id });
    expect(
      rollTrackedStrike(store, owner, fixed(10), { actorId: hero.id, itemId }).message
        .attackNumber,
    ).toBe(1);
  });

  it('keeps the override: a number given is used and the tracker counts nothing', () => {
    const { owner, hero, itemId, ada, stored, start } = fight();
    start();
    const result = rollTrackedStrike(store, owner, fixed(10), {
      actorId: hero.id,
      itemId,
      attackNumber: 3,
    });
    expect(result.message.attackNumber).toBe(3);
    expect(result.combatant).toBeUndefined();
    expect(stored(ada.id).turn.attacksMade).toBe(0);
  });

  it('supplies nothing and counts nothing with no active combat', () => {
    const { owner, hero, itemId, ada, stored } = fight();
    expect(() =>
      rollTrackedStrike(store, owner, fixed(10), { actorId: hero.id, itemId }),
    ).toThrow('attackNumber is required');
    const result = rollTrackedStrike(store, owner, fixed(10), {
      actorId: hero.id,
      itemId,
      attackNumber: 2,
    });
    expect(result.message.attackNumber).toBe(2);
    expect(result.combatant).toBeUndefined();
    expect(stored(ada.id).turn.attacksMade).toBe(0);
  });
});
