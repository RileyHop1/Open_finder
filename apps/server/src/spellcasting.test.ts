import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type { CharacterData } from '@hearthtable/pf2e';
import { characterDataSchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, updateActor } from './actors.js';
import { OperationRejected } from './rejection.js';
import { setSpellcasting } from './spellcasting.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-spellcasting-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-15T00:00:00.000Z';

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

const sheetOf = (actorId: string): CharacterData =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

const BUILT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';

const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'spontaneous',
  name: 'Invented spellcasting',
  tradition: 'occult',
  attribute: 'cha',
  rank: 'trained',
  slots: { '1': { max: 2, used: 0 } },
  ...extra,
});

/** A character with one entry made by a build (it has a source) and one made by hand. */
function caster() {
  const owner = makeSeat();
  const actor = createActor(store, owner, { kind: 'character', name: 'Hero' });
  updateActor(store, owner, {
    actorId: actor.id,
    changes: {
      'system.spellcasting': [
        entry(BUILT_ID, { source: 'class:invented' }),
        entry(OTHER_ID, { name: 'By hand' }),
      ],
    },
  });
  return { owner, actorId: actor.id };
}

describe('actor.setSpellcasting', () => {
  it('replaces the named entry whole and leaves the others and their order alone', () => {
    const { owner, actorId } = caster();
    const spellId = crypto.randomUUID();
    setSpellcasting(store, owner, {
      actorId,
      entry: entry(BUILT_ID, {
        repertoire: [spellId],
        slots: { '1': { max: 3, used: 1 } },
      }),
    });

    const [first, second] = sheetOf(actorId).spellcasting;
    expect(first?.id).toBe(BUILT_ID);
    expect(first?.kind === 'spontaneous' ? first.repertoire : []).toEqual([spellId]);
    expect(first?.kind === 'spontaneous' ? first.slots['1'] : undefined).toEqual({
      max: 3,
      used: 1,
    });
    expect(second?.name).toBe('By hand');
  });

  it('adds an entry whose id is new, without a build source', () => {
    const { owner, actorId } = caster();
    const id = crypto.randomUUID();
    setSpellcasting(store, owner, {
      actorId,
      entry: entry(id, { name: 'New', source: 'class:forged' }),
    });

    const entries = sheetOf(actorId).spellcasting;
    expect(entries.map((e) => e.name)).toEqual([
      'Invented spellcasting',
      'By hand',
      'New',
    ]);
    expect(entries[2]?.source).toBeUndefined();
  });

  it('keeps an entry’s build source when it is replaced, whatever the client sent', () => {
    const { owner, actorId } = caster();
    setSpellcasting(store, owner, {
      actorId,
      entry: entry(BUILT_ID, { source: 'class:something-else' }),
    });
    setSpellcasting(store, owner, {
      actorId,
      entry: entry(OTHER_ID, { source: 'class:x' }),
    });

    const [built, byHand] = sheetOf(actorId).spellcasting;
    expect(built?.source).toBe('class:invented');
    expect(byHand?.source).toBeUndefined();
  });

  it('accepts what the rules would call a mistake (ADR 0023)', () => {
    const { owner, actorId } = caster();
    const itemId = crypto.randomUUID();
    setSpellcasting(store, owner, {
      actorId,
      entry: entry(OTHER_ID, {
        kind: 'prepared',
        slots: { '1': 1 },
        // Three rows in one slot, at a rank with no slots, for an item that is not there.
        prepared: [
          { rank: 1, itemId, expended: false },
          { rank: 1, itemId, expended: true },
          { rank: 9, itemId, expended: false },
        ],
      }),
    });
    const stored = sheetOf(actorId).spellcasting[1];
    expect(stored?.kind === 'prepared' ? stored.prepared : []).toHaveLength(3);
  });

  it('rejects a malformed entry and writes nothing', () => {
    const { owner, actorId } = caster();
    const before = store.getDocument(actorId);
    expect(() =>
      setSpellcasting(store, owner, {
        actorId,
        entry: entry(BUILT_ID, { tradition: 'dragon' }),
      }),
    ).toThrow(/invalid spellcasting entry: tradition/);
    expect(() =>
      setSpellcasting(store, owner, { actorId, entry: { kind: 'prepared' } }),
    ).toThrow(OperationRejected);
    expect(store.getDocument(actorId)).toEqual(before);
  });

  it('is for the owner or the GM, not another player', () => {
    const { actorId } = caster();
    const stranger = makeSeat({ name: 'Stranger' });
    expect(() =>
      setSpellcasting(store, stranger, { actorId, entry: entry(OTHER_ID) }),
    ).toThrow(OperationRejected);

    const gm = makeSeat({ name: 'GM', isGM: true });
    setSpellcasting(store, gm, { actorId, entry: entry(OTHER_ID, { name: 'GM edit' }) });
    expect(sheetOf(actorId).spellcasting[1]?.name).toBe('GM edit');
  });

  it('is for a character, not a monster', () => {
    const gm = makeSeat({ name: 'GM', isGM: true });
    const npc = createActor(store, gm, { kind: 'npc', name: 'Goblin' });
    expect(() =>
      setSpellcasting(store, gm, { actorId: npc.id, entry: entry(OTHER_ID) }),
    ).toThrow(/does not have a character sheet/);
  });
});
