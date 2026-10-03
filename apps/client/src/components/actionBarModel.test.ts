import type { Actor, Combatant } from '@hearthtable/core';
import { actorSchema, combatantSchema } from '@hearthtable/core';
import type { CharacterData, WeaponEntry } from '@hearthtable/pf2e';
import { newCharacterData } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { actionBarView } from './actionBarModel.js';
import { makeNpc } from './sheet/testNpc.js';

const NOW = '2026-10-01T00:00:00.000Z';
const base = (type: string) => ({
  id: crypto.randomUUID(),
  worldId: crypto.randomUUID(),
  type,
  schemaVersion: 1,
  permissions: { default: 'observer' as const, seats: {} },
  createdAt: NOW,
  updatedAt: NOW,
});

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

/** Str +4, martial trained: +7 to hit, so the MAP variants are +7 / +2 / −3. */
function makeCharacter(): Actor {
  const base2 = newCharacterData();
  const itemId = crypto.randomUUID();
  const data: CharacterData = {
    ...base2,
    attributes: { ...base2.attributes, str: 4 },
    ranks: { ...base2.ranks, weapons: { ...base2.ranks.weapons, martial: 'trained' } },
    items: [{ id: itemId, entry: SWORD, equipped: true, quantity: 1 }],
  };
  return actorSchema.parse({
    ...base('actor'),
    kind: 'character',
    name: 'Ada',
    system: data,
  });
}

const makeCombatant = (): Combatant =>
  combatantSchema.parse({
    ...base('combatant'),
    combatId: crypto.randomUUID(),
    tokenId: crypto.randomUUID(),
    actorId: crypto.randomUUID(),
  });

describe('actionBarView', () => {
  it('carries a character’s strikes with all three MAP variants precomputed', () => {
    const character = makeCharacter();
    const view = actionBarView(character, undefined);
    expect(view.strikes).toHaveLength(1);
    const [strike] = view.strikes;
    expect(strike?.name).toBe('Invented Sword');
    expect(strike?.attacks.map((a) => [a.attackNumber, a.total])).toEqual([
      [1, 7],
      [2, 2],
      [3, -3],
    ]);
    expect(strike?.target).toEqual({
      itemId: (character.system as CharacterData).items[0]?.id,
    });
  });

  it('names an NPC’s strike by its strike key, not an item id', () => {
    const view = actionBarView(makeNpc(), undefined);
    expect(view.strikes[0]?.target).toEqual({ strikeKey: 'strike:vine' });
  });

  it('lists the basic actions, and says whether there is a combatant to spend against', () => {
    const noCombat = actionBarView(makeCharacter(), undefined);
    expect(noCombat.canAct).toBe(false);
    expect(noCombat.basics.map((b) => b.name)).toContain('Stride');

    const inCombat = actionBarView(makeCharacter(), makeCombatant());
    expect(inCombat.canAct).toBe(true);
  });

  it('shows no strikes for an actor with nothing to read', () => {
    const blank = actorSchema.parse({
      ...base('actor'),
      kind: 'character',
      name: 'Blank',
      system: {},
    });
    expect(actionBarView(blank, undefined).strikes).toEqual([]);
  });
});
