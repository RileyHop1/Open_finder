import type { Actor, Combatant } from '@hearthtable/core';
import { actorSchema, combatantSchema } from '@hearthtable/core';
import type { CharacterData, WeaponEntry } from '@hearthtable/pf2e';
import {
  creatureEntrySchema,
  newCharacterData,
  newNpcFromCreature,
} from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { actionBarView } from './actionBarModel.js';
import { BOG_STRANGLER, makeNpc } from './sheet/testNpc.js';

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

const REACH_SWORD: WeaponEntry = { ...SWORD, traits: ['reach'] };
const BOW: WeaponEntry = { ...SWORD, kind: 'weapon', group: 'bow', range: 60 };

/** Str +4, martial trained: +7 to hit, so the MAP variants are +7 / +2 / −3. */
function makeCharacter(weapons: WeaponEntry[] = [SWORD]): Actor {
  const base2 = newCharacterData();
  const data: CharacterData = {
    ...base2,
    attributes: { ...base2.attributes, str: 4 },
    ranks: { ...base2.ranks, weapons: { ...base2.ranks.weapons, martial: 'trained' } },
    items: weapons.map((entry) => ({
      id: crypto.randomUUID(),
      entry,
      equipped: true,
      quantity: 1,
    })),
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

  it('carries whether a strike is melee or ranged, and a reach weapon’s trait', () => {
    const view = actionBarView(makeCharacter([SWORD, REACH_SWORD, BOW]), undefined);
    expect(view.strikes.map((s) => [s.ranged, s.reach, s.rangeFeet])).toEqual([
      [false, false, undefined],
      [false, true, undefined],
      [true, false, 60],
    ]);
  });

  it('leaves an NPC strike’s reach and range unknown: no weapon entry to read them from', () => {
    const view = actionBarView(makeNpc(), undefined);
    expect(view.strikes[0]).toMatchObject({ reach: false, rangeFeet: undefined });
  });

  it('carries a weapon’s traits on a character strike, and a strike’s own traits on an NPC’s', () => {
    const [sword, reachSword] = actionBarView(
      makeCharacter([SWORD, REACH_SWORD]),
      undefined,
    ).strikes;
    expect(sword?.traits).toEqual([]);
    expect(reachSword?.traits).toEqual(['reach']);

    // The raw creature data, not `prepareNpc`'s own output, is where an
    // NPC strike's traits come from (it carries none) -- read by index
    // against `creature.strikes`, so this checks that index lines up.
    const creature = creatureEntrySchema.parse({
      ...BOG_STRANGLER,
      strikes: [{ ...BOG_STRANGLER.strikes[0], traits: ['agile', 'finesse'] }],
    });
    const npc = makeNpc({
      system: newNpcFromCreature(creature, { packId: 'bestiary', slug: 'invented' }),
    });
    expect(actionBarView(npc, undefined).strikes[0]?.traits).toEqual([
      'agile',
      'finesse',
    ]);
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
