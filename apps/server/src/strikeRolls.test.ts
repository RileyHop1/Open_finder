import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import {
  actorSchema,
  chatStrikeAttackMessageSchema,
  chatStrikeDamageMessageSchema,
  sceneSchema,
} from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import type { CharacterData, Pf2eEntry, WeaponEntry } from '@hearthtable/pf2e';
import { characterDataSchema, prepareCharacter } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, updateActor } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { addItem, updateItem } from './items.js';
import { addPartyMember, setPartyScene } from './party.js';
import { createScene, updateScene } from './scenes.js';
import { rollActorDamage, rollActorStrike } from './strikeRolls.js';
import { isFlanking } from './flanking.js';
import { placeToken } from './tokens.js';
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

describe('striking a token', () => {
  /** The swordsman, a party scene, and `kind` of target on it, with the given visibility. */
  function aimAt(
    options: {
      tokenHidden?: boolean;
      actorPublic?: boolean;
      kind?: 'character' | 'hazard';
    } = {},
  ) {
    const attacker = swordsman();
    const gm = makeSeat({ name: 'GM', isGM: true });
    const scene = createScene(store, gm, { name: 'Crypt', kind: 'battle' });
    setPartyScene(store, scene.id);
    const target = createActor(store, gm, {
      kind: options.kind ?? 'character',
      name: 'Dummy',
    });
    store.putDocument({
      ...target,
      permissions: {
        default: options.actorPublic === false ? 'none' : 'observer',
        seats: {},
      },
    });
    const token = placeToken(store, {
      scene,
      actor: target,
      size: 1,
      x: 350,
      y: 450,
      hidden: options.tokenHidden ?? false,
    });
    const armorClass = (): number => {
      const sheet = characterDataSchema.parse(
        actorSchema.parse(store.getDocument(target.id)).system,
      );
      return prepareCharacter(sheet).statistics['ac']?.total ?? 0;
    };
    return { ...attacker, gm, token, armorClass };
  }

  it("uses the target's Armor Class as the DC, shows it, and names the target", () => {
    const { owner, actorId, itemId, token, armorClass } = aimAt();
    const message = rollActorStrike(store, owner, fixed(10), {
      actorId,
      itemId,
      attackNumber: 1,
      targetTokenId: token.id,
    });
    expect(message.dc).toBe(armorClass());
    expect(message.roll.degree).toBeDefined();
    expect(message).toMatchObject({ targetTokenId: token.id, targetName: 'Dummy' });
  });

  it('lets an explicit dc override the target', () => {
    const { owner, actorId, itemId, token } = aimAt();
    const message = rollActorStrike(store, owner, fixed(10), {
      actorId,
      itemId,
      attackNumber: 1,
      dc: 30,
      targetTokenId: token.id,
    });
    expect(message.dc).toBe(30);
    expect(message.roll.degree).toBe('criticalFailure');
  });

  it("keeps a monster's Armor Class off the card when its actor is not public, but still gives the degree", () => {
    const { owner, actorId, itemId, token } = aimAt({ actorPublic: false });
    const message = rollActorStrike(store, owner, fixed(10), {
      actorId,
      itemId,
      attackNumber: 1,
      targetTokenId: token.id,
    });
    expect(message.dc).toBeUndefined();
    expect(message.roll.degree).toBeDefined();
    expect(message.targetName).toBe('Dummy');
  });

  it('never names a hidden token: the GM can strike it, and the card shows only the degree', () => {
    const { gm, actorId, itemId, token } = aimAt({ tokenHidden: true });
    const message = rollActorStrike(store, gm, fixed(10), {
      actorId,
      itemId,
      attackNumber: 1,
      targetTokenId: token.id,
    });
    expect(message.targetTokenId).toBeUndefined();
    expect(message.targetName).toBeUndefined();
    expect(message.roll.degree).toBeDefined();
  });

  it('reports a token the seat cannot see as not found, and a target with no Armor Class', () => {
    const { owner, actorId, itemId, token } = aimAt({ tokenHidden: true });
    expect(() =>
      rollActorStrike(store, owner, fixed(10), {
        actorId,
        itemId,
        attackNumber: 1,
        targetTokenId: token.id,
      }),
    ).toThrow('no token found');
    const trap = aimAt({ kind: 'hazard' });
    expect(() =>
      rollActorStrike(store, trap.owner, fixed(10), {
        actorId: trap.actorId,
        itemId: trap.itemId,
        attackNumber: 1,
        targetTokenId: trap.token.id,
      }),
    ).toThrow('no armor class');
  });
});

describe('flanking a target', () => {
  type At = { x: number; y: number };
  const TARGET: At = { x: 250, y: 250 };

  /**
   * A party swordsman at the target's west, a party ally at `allyAt` (default: its east),
   * and a target on the other side, all on a gridded scene the party is in.
   */
  function flankTable(
    options: {
      allyAt?: At;
      allyConditions?: unknown[];
      targetConditions?: unknown[];
      gridless?: boolean;
    } = {},
  ) {
    const attacker = swordsman();
    const gm = makeSeat({ name: 'GM', isGM: true });
    const scene = createScene(store, gm, { name: 'Crypt', kind: 'battle' });
    if (options.gridless === true) {
      updateScene(store, gm, { sceneId: scene.id, changes: { grid: { type: 'none' } } });
    }
    setPartyScene(store, scene.id);
    const put = (actorId: string, at: At) =>
      placeToken(store, {
        scene: sceneSchemaOf(scene.id),
        actor: actorSchema.parse(store.getDocument(actorId)),
        size: 1,
        ...at,
      });
    const withConditions = (actorId: string, conditions: unknown[] | undefined) => {
      if (conditions === undefined) {
        return;
      }
      const stored = actorSchema.parse(store.getDocument(actorId));
      store.putDocument({
        ...stored,
        system: { ...stored.system, conditions },
      } as typeof stored);
    };
    addPartyMember(store, gm, { actorId: attacker.actorId });
    put(attacker.actorId, { x: 150, y: 250 });

    const ally = createActor(store, gm, { kind: 'character', name: 'Ben' });
    addPartyMember(store, gm, { actorId: ally.id });
    withConditions(ally.id, options.allyConditions);
    put(ally.id, options.allyAt ?? { x: 350, y: 250 });

    const dummy = createActor(store, gm, { kind: 'character', name: 'Dummy' });
    store.putDocument({ ...dummy, permissions: { default: 'observer', seats: {} } });
    withConditions(dummy.id, options.targetConditions);
    const token = put(dummy.id, TARGET);
    const armorClass = (): number =>
      prepareCharacter(sheetOf(dummy.id)).statistics['ac']?.total ?? 0;
    const strike = () =>
      rollActorStrike(store, attacker.owner, fixed(10), {
        actorId: attacker.actorId,
        itemId: attacker.itemId,
        attackNumber: 1,
        targetTokenId: token.id,
      });
    return { strike, armorClass, ally, dummy, token, attacker };
  }

  function sceneSchemaOf(sceneId: string) {
    return sceneSchema.parse(store.getDocument(sceneId));
  }

  it('makes the target off-guard against the strike when two allies hold opposite sides', () => {
    const { strike, armorClass } = flankTable();
    const message = strike();
    expect(message.flanking).toBe(true);
    expect(message.dc).toBe(armorClass() - 2);
  });

  const doesNothing = (name: string, options: Parameters<typeof flankTable>[0]): void => {
    it(`does nothing when ${name}`, () => {
      const { strike, armorClass } = flankTable(options);
      const message = strike();
      expect(message.flanking).toBeUndefined();
      expect(message.dc).toBe(armorClass());
    });
  };
  doesNothing('the second ally is not opposite', { allyAt: { x: 250, y: 150 } });
  doesNothing('the second ally is out of reach', { allyAt: { x: 450, y: 250 } });
  doesNothing('the second ally cannot act', {
    allyConditions: [{ slug: 'unconscious' }],
  });

  it('adds nothing to a target who is already off-guard, since the penalty does not stack', () => {
    const { strike, armorClass } = flankTable({
      targetConditions: [{ slug: 'off-guard' }],
    });
    const message = strike();
    expect(message.flanking).toBeUndefined();
    expect(message.dc).toBe(armorClass());
  });

  it('never flanks on a gridless scene', () => {
    expect(flankTable({ gridless: true }).strike().flanking).toBeUndefined();
  });

  it('never flanks with a ranged strike', () => {
    const { token, attacker } = flankTable();
    expect(isFlanking(store, attacker.actorId, token, { ranged: false })).toBe(true);
    expect(isFlanking(store, attacker.actorId, token, { ranged: true })).toBe(false);
  });

  it("never flanks a target on the attacker's own side", () => {
    const { token, attacker } = flankTable();
    const dummy = actorSchema.parse(store.getDocument(token.actorId));
    const gm = makeSeat({ name: 'GM', isGM: true });
    addPartyMember(store, gm, { actorId: dummy.id });
    expect(isFlanking(store, attacker.actorId, token, { ranged: false })).toBe(false);
  });
});
