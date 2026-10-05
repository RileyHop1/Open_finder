import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema, combatantSchema } from '@hearthtable/core';
import type { CharacterData, ConditionEntry } from '@hearthtable/pf2e';
import { characterDataSchema, prepareCharacter } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { emptyCompendium } from './compendium.js';
import {
  addConditionToActor,
  removeConditionFromActor,
  setConditionOnActor,
} from './conditions.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-conditions-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-09-30T00:00:00.000Z';

function definition(
  slug: string,
  fields: Partial<Pick<ConditionEntry, 'valued' | 'maxValue' | 'group'>> = {},
): ConditionEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'conditions',
    slug,
    name: slug,
    kind: 'condition',
    provenance: {
      publication: 'Pathfinder Player Core',
      license: 'ORC',
      remaster: true,
    },
    traits: [],
    ruleElements: [],
    description: '',
    valued: false,
    overrides: [],
    ...fields,
  };
}

function compendiumWith(entries: readonly ConditionEntry[]): CompendiumIndex {
  const map = new Map(entries.map((e) => [e.slug, e]));
  return {
    status: () => ({
      available: entries.length > 0,
      packs: [],
      entryCount: entries.length,
      skipped: 0,
    }),
    search: () => [],
    get: () => undefined,
    conditions: () => map,
    traits: () => [],
  };
}

const imported = compendiumWith([
  definition('frightened', { valued: true, maxValue: 4 }),
  definition('clumsy', { valued: true }),
  definition('prone'),
  // An invented mutually exclusive ladder, standing in for the detection states.
  definition('observed', { group: 'ladder' }),
  definition('hidden', { group: 'ladder' }),
]);

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

function ownedCharacter() {
  const owner = makeSeat();
  // Unique per call: one test makes two in the same world.
  const actor = createActor(store, owner, {
    kind: 'character',
    name: `Hero ${crypto.randomUUID()}`,
  });
  return { owner, actorId: actor.id };
}

const sheetOf = (actorId: string): CharacterData =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

const add = (
  seat: Seat,
  actorId: string,
  slug: string,
  value?: number,
  compendium: CompendiumIndex = imported,
) =>
  addConditionToActor(store, seat, compendium, {
    actorId,
    slug,
    ...(value === undefined ? {} : { value }),
  });

const set = (seat: Seat, actorId: string, slug: string, value?: number) =>
  setConditionOnActor(store, seat, imported, {
    actorId,
    slug,
    ...(value === undefined ? {} : { value }),
  });

describe('addConditionToActor', () => {
  it('adds a valued and a binary condition', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'frightened', 2);
    add(owner, actorId, 'prone');
    expect(sheetOf(actorId).conditions).toEqual([
      { slug: 'frightened', value: 2 },
      { slug: 'prone' },
    ]);
  });

  it('keeps the higher value from two sources, in either order, never the sum', () => {
    const first = ownedCharacter();
    add(first.owner, first.actorId, 'frightened', 2);
    add(first.owner, first.actorId, 'frightened', 1);
    expect(sheetOf(first.actorId).conditions).toEqual([{ slug: 'frightened', value: 2 }]);

    const second = ownedCharacter();
    add(second.owner, second.actorId, 'frightened', 1);
    add(second.owner, second.actorId, 'frightened', 2);
    expect(sheetOf(second.actorId).conditions).toEqual([
      { slug: 'frightened', value: 2 },
    ]);
  });

  it('clamps to the definition maximum', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'frightened', 9);
    expect(sheetOf(actorId).conditions).toEqual([{ slug: 'frightened', value: 4 }]);
  });

  it('clears the other members of a mutually exclusive group', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'observed');
    add(owner, actorId, 'prone');
    add(owner, actorId, 'hidden');
    expect(sheetOf(actorId).conditions).toEqual([{ slug: 'prone' }, { slug: 'hidden' }]);
  });

  it('refuses an unknown condition once definitions have been imported', () => {
    const { owner, actorId } = ownedCharacter();
    expect(() => add(owner, actorId, 'frigthened', 2)).toThrow(
      /unknown condition: frigthened/,
    );
    expect(sheetOf(actorId).conditions).toEqual([]);
  });

  it('accepts any well-formed slug when nothing has been imported yet', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'mystery', 2, emptyCompendium());
    expect(sheetOf(actorId).conditions).toEqual([{ slug: 'mystery', value: 2 }]);
  });

  it('refuses a non-owner, treats a hidden actor as not found, and rejects an NPC with no creature', () => {
    const { actorId } = ownedCharacter();
    expect(() => add(makeSeat(), actorId, 'prone')).toThrow(/do not have permission/);

    const stored = actorSchema.parse(store.getDocument(actorId));
    store.putDocument({ ...stored, permissions: { default: 'none', seats: {} } });
    expect(() => add(makeSeat(), actorId, 'prone')).toThrow(/no actor found/);

    const owner = makeSeat();
    const npc = createActor(store, owner, { kind: 'npc', name: 'Innkeeper' });
    expect(() => add(owner, npc.id, 'prone')).toThrow(/has no creature stats/);
  });

  it('lets the GM add to any character', () => {
    const { actorId } = ownedCharacter();
    add(makeSeat({ isGM: true }), actorId, 'prone');
    expect(sheetOf(actorId).conditions).toEqual([{ slug: 'prone' }]);
  });
});

describe('setConditionOnActor -- the GM override', () => {
  it('lowers a value, which adding would refuse', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'frightened', 3);
    set(owner, actorId, 'frightened', 1);
    expect(sheetOf(actorId).conditions).toEqual([{ slug: 'frightened', value: 1 }]);
  });

  it('removes the condition when set to 0', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'frightened', 3);
    add(owner, actorId, 'prone');
    set(owner, actorId, 'frightened', 0);
    expect(sheetOf(actorId).conditions).toEqual([{ slug: 'prone' }]);
  });

  it('refuses an unknown condition and a non-owner', () => {
    const { owner, actorId } = ownedCharacter();
    expect(() => set(owner, actorId, 'nonsense', 1)).toThrow(/unknown condition/);
    expect(() => set(makeSeat(), actorId, 'prone')).toThrow(/do not have permission/);
  });
});

describe('condition durations from a client', () => {
  const withDuration = (
    seat: Seat,
    actorId: string,
    duration: Record<string, unknown>,
    mode: 'add' | 'set' = 'add',
  ) =>
    (mode === 'add' ? addConditionToActor : setConditionOnActor)(store, seat, imported, {
      actorId,
      slug: 'frightened',
      value: 2,
      duration,
    });

  it('stores a rounds duration on an added condition', () => {
    const { owner, actorId } = ownedCharacter();
    withDuration(owner, actorId, { type: 'rounds', remaining: 3 });
    expect(sheetOf(actorId).conditions).toEqual([
      { slug: 'frightened', value: 2, duration: { type: 'rounds', remaining: 3 } },
    ]);
  });

  it('replaces the duration when the GM sets the condition', () => {
    const { owner, actorId } = ownedCharacter();
    withDuration(owner, actorId, { type: 'rounds', remaining: 3 });
    withDuration(owner, actorId, { type: 'days', remaining: 1 }, 'set');
    expect(sheetOf(actorId).conditions[0]?.duration).toEqual({
      type: 'days',
      remaining: 1,
    });
  });

  it('refuses a duration the game system does not know', () => {
    const { owner, actorId } = ownedCharacter();
    expect(() => withDuration(owner, actorId, { type: 'forever' })).toThrow(
      /valid condition duration/,
    );
    expect(() => withDuration(owner, actorId, { type: 'rounds', remaining: 0 })).toThrow(
      /valid condition duration/,
    );
  });

  it('anchors to a combatant that exists, and refuses one that does not', () => {
    const { owner, actorId } = ownedCharacter();
    const combatantId = crypto.randomUUID();
    expect(() =>
      withDuration(owner, actorId, { type: 'turn', combatantId, boundary: 'end' }),
    ).toThrow(/no combatant found/);

    store.putDocument(
      combatantSchema.parse({
        id: combatantId,
        worldId: store.world.id,
        type: 'combatant',
        schemaVersion: 1,
        permissions: { default: 'observer', seats: {} },
        createdAt: NOW,
        updatedAt: NOW,
        combatId: crypto.randomUUID(),
        tokenId: crypto.randomUUID(),
        actorId,
      }),
    );
    withDuration(owner, actorId, { type: 'turn', combatantId, boundary: 'end' });
    expect(sheetOf(actorId).conditions[0]?.duration).toEqual({
      type: 'turn',
      combatantId,
      boundary: 'end',
    });
  });
});

describe('removeConditionFromActor', () => {
  it('removes one condition and leaves the rest', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'frightened', 2);
    add(owner, actorId, 'prone');
    removeConditionFromActor(store, owner, { actorId, slug: 'frightened' });
    expect(sheetOf(actorId).conditions).toEqual([{ slug: 'prone' }]);
  });

  it('is not an error to remove a condition the character does not have', () => {
    const { owner, actorId } = ownedCharacter();
    removeConditionFromActor(store, owner, { actorId, slug: 'prone' });
    expect(sheetOf(actorId).conditions).toEqual([]);
  });

  it('refuses a non-owner', () => {
    const { owner, actorId } = ownedCharacter();
    add(owner, actorId, 'prone');
    expect(() =>
      removeConditionFromActor(store, makeSeat(), { actorId, slug: 'prone' }),
    ).toThrow(/do not have permission/);
    expect(sheetOf(actorId).conditions).toEqual([{ slug: 'prone' }]);
  });
});

describe('conditions change the derived numbers', () => {
  it('lowers saves while frightened and restores them when removed', () => {
    const { owner, actorId } = ownedCharacter();
    const fortitude = () =>
      prepareCharacter(sheetOf(actorId)).statistics['fortitude']?.total;
    expect(fortitude()).toBe(0);
    add(owner, actorId, 'frightened', 2);
    expect(fortitude()).toBe(-2);
    set(owner, actorId, 'frightened', 1);
    expect(fortitude()).toBe(-1);
    removeConditionFromActor(store, owner, { actorId, slug: 'frightened' });
    expect(fortitude()).toBe(0);
  });
});
