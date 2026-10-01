import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import {
  actorSchema,
  chatStrikeAttackMessageSchema,
  chatStrikeDamageMessageSchema,
} from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import type { CharacterData, Pf2eEntry, WeaponEntry } from '@hearthtable/pf2e';
import { characterDataSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, updateActor } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { addItem, updateItem } from './items.js';
import { rollActorDamage, rollActorStrike } from './strikeRolls.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-strike-rolls-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-09-30T00:00:00.000Z';

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

/** A level 1 fighter-ish character: Str +4, martial trained (+3 with level) = +7 to hit; sword unequipped. */
function swordsman(equipped = true) {
  const owner = makeSeat();
  const actor = createActor(store, owner, { kind: 'character', name: 'Hero' });
  updateActor(store, owner, {
    actorId: actor.id,
    changes: { 'system.attributes.str': 4, 'system.ranks.weapons.martial': 'trained' },
  });
  addItem(store, owner, compendium, {
    actorId: actor.id,
    packId: 'equipment',
    slug: SWORD.slug,
  });
  const itemId = sheetOf(actor.id).items[0]?.id ?? '';
  if (equipped) {
    updateItem(store, owner, { actorId: actor.id, itemId, equipped: true });
  }
  return { owner, actorId: actor.id, itemId };
}

describe('rollActorStrike', () => {
  it('rolls the first attack with the prepared bonus and stores it as chat', () => {
    const { owner, actorId, itemId } = swordsman();
    const message = rollActorStrike(store, owner, fixed(10), {
      actorId,
      itemId,
      attackNumber: 1,
    });
    expect(message).toMatchObject({
      kind: 'strikeAttack',
      actorName: 'Hero',
      weaponName: 'Invented Sword',
      itemId,
      attackNumber: 1,
      breakdown: { total: 7 },
      roll: { expression: '1d20+7', total: 17, natural: 10 },
    });
    expect(chatStrikeAttackMessageSchema.parse(store.getDocument(message.id))).toEqual(
      message,
    );
  });

  it('applies the Multiple Attack Penalty on the second and third attack, visibly', () => {
    const { owner, actorId, itemId } = swordsman();
    const attack = (attackNumber: 1 | 2 | 3) =>
      rollActorStrike(store, owner, fixed(10), { actorId, itemId, attackNumber });
    expect(attack(2).breakdown.total).toBe(2);
    expect(attack(3).breakdown.total).toBe(-3);
    const penalty = attack(2).breakdown.modifiers.find((m) => m.value === -5);
    expect(penalty).toMatchObject({ applied: true });
  });

  it('adds a degree of success against a DC', () => {
    const { owner, actorId, itemId } = swordsman();
    const message = rollActorStrike(store, owner, fixed(13), {
      actorId,
      itemId,
      attackNumber: 1,
      dc: 20,
    });
    expect(message.dc).toBe(20);
    expect(message.roll.degree).toBe('success');
  });

  it('refuses an unequipped weapon, an unknown item, a non-owner, and an NPC', () => {
    const unequipped = swordsman(false);
    const roll = (who: Seat, actorId: string, itemId: string) =>
      rollActorStrike(store, who, fixed(10), { actorId, itemId, attackNumber: 1 });
    expect(() => roll(unequipped.owner, unequipped.actorId, unequipped.itemId)).toThrow(
      /only an equipped weapon/,
    );

    const { owner, actorId, itemId } = swordsman();
    expect(() => roll(owner, actorId, crypto.randomUUID())).toThrow(/no item found/);
    expect(() => roll(makeSeat(), actorId, itemId)).toThrow(/do not have permission/);

    const npc = createActor(store, owner, { kind: 'npc', name: 'Innkeeper' });
    expect(() => roll(owner, npc.id, itemId)).toThrow(/give strikeKey/);
    expect(store.listDocuments('chatMessage')).toEqual([]);
  });
});

describe('rollActorDamage', () => {
  it('rolls the weapon dice plus Strength, and doubles it on a critical', () => {
    const { owner, actorId, itemId } = swordsman();
    const normal = rollActorDamage(store, owner, fixed(5), {
      actorId,
      itemId,
      critical: false,
    });
    expect(normal).toMatchObject({
      kind: 'strikeDamage',
      critical: false,
      breakdown: { total: 4 },
      roll: { total: 9, damage: { slashing: 9 } },
    });
    expect(chatStrikeDamageMessageSchema.parse(store.getDocument(normal.id))).toEqual(
      normal,
    );

    const critical = rollActorDamage(store, owner, fixed(5), {
      actorId,
      itemId,
      critical: true,
    });
    expect(critical.critical).toBe(true);
    expect(critical.roll.total).toBe(18);
  });

  it('refuses an unequipped weapon and a non-owner, and stores nothing', () => {
    const unequipped = swordsman(false);
    expect(() =>
      rollActorDamage(store, unequipped.owner, fixed(5), {
        actorId: unequipped.actorId,
        itemId: unequipped.itemId,
        critical: false,
      }),
    ).toThrow(/only an equipped weapon/);

    const { actorId, itemId } = swordsman();
    expect(() =>
      rollActorDamage(store, makeSeat(), fixed(5), { actorId, itemId, critical: false }),
    ).toThrow(/do not have permission/);
    expect(store.listDocuments('chatMessage')).toEqual([]);
  });
});
