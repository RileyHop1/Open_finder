import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { actorSchema, chatSpellCastMessageSchema } from '@hearthtable/core';
import type { CharacterData, Pf2eEntry } from '@hearthtable/pf2e';
import { characterDataSchema, pf2eEntrySchema } from '@hearthtable/pf2e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, updateActor } from './actors.js';
import { castSpell, refocus, restSpells } from './castSpell.js';
import { rollActorCheck } from './checks.js';
import type { CompendiumIndex } from './compendium.js';
import { addItem } from './items.js';
import { OperationRejected } from './rejection.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-cast-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-10-14T00:00:00.000Z';

// Everything below is invented (ADR 0013).
const spell = (slug: string, extra: Record<string, unknown> = {}) =>
  pf2eEntrySchema.parse({
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'spells',
    slug,
    name: slug,
    kind: 'spell',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: `The text of ${slug}.`,
    rank: 1,
    traditions: ['arcane'],
    castTime: '2',
    range: { kind: 'feet', value: 30 },
    ...extra,
  });

const entries: Pf2eEntry[] = [
  spell('invented-burst', { defense: { save: 'reflex', basic: true } }),
  spell('invented-bolt', { traits: ['attack'] }),
  spell('invented-spark', { traits: ['cantrip'] }),
  spell('invented-flare', { traits: ['focus'] }),
  pf2eEntrySchema.parse({
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'equipment',
    slug: 'rope',
    name: 'Rope',
    kind: 'gear',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
  }),
];

const compendium: CompendiumIndex = {
  status: () => ({ available: true, packs: [], entryCount: entries.length, skipped: 0 }),
  search: () => [],
  get: (packId, slug) => entries.find((e) => e.packId === packId && e.slug === slug),
  conditions: () => new Map(),
  traits: () => [],
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

const sheetOf = (actorId: string): CharacterData =>
  characterDataSchema.parse(actorSchema.parse(store.getDocument(actorId)).system);

const PREPARED_ID = '00000000-0000-4000-8000-000000000001';
const SPONTANEOUS_ID = '00000000-0000-4000-8000-000000000002';

/** A character with +4 Intelligence, the five spells above, and one entry of each kind. */
function caster() {
  const owner = makeSeat();
  const actor = createActor(store, owner, { kind: 'character', name: 'Hero' });
  const itemId: Record<string, string> = {};
  for (const slug of [
    'invented-burst',
    'invented-bolt',
    'invented-spark',
    'invented-flare',
  ]) {
    addItem(store, owner, compendium, { actorId: actor.id, packId: 'spells', slug });
  }
  addItem(store, owner, compendium, {
    actorId: actor.id,
    packId: 'equipment',
    slug: 'rope',
  });
  for (const item of sheetOf(actor.id).items) {
    itemId[item.entry.slug] = item.id;
  }
  updateActor(store, owner, {
    actorId: actor.id,
    changes: {
      'system.attributes.int': 4,
      'system.focusPoints': { max: 1, current: 1 },
      'system.spellcasting': [
        {
          id: PREPARED_ID,
          kind: 'prepared',
          name: 'Prepared',
          tradition: 'arcane',
          attribute: 'int',
          rank: 'trained',
          slots: { '1': 2 },
          prepared: [{ rank: 1, itemId: itemId['invented-burst'], expended: false }],
        },
        {
          id: SPONTANEOUS_ID,
          kind: 'spontaneous',
          name: 'Spontaneous',
          tradition: 'arcane',
          attribute: 'int',
          rank: 'trained',
          slots: { '1': { max: 1, used: 0 } },
        },
      ],
    },
  });
  return { owner, actorId: actor.id, itemId };
}

const lastCard = () => {
  const cards = store
    .listDocuments('chatMessage')
    .map((m) => chatSpellCastMessageSchema.safeParse(m))
    .flatMap((r) => (r.success ? [r.data] : []));
  return cards[cards.length - 1];
};

describe('actor.castSpell', () => {
  it('casts a prepared spell: marks it cast, and the card carries the DC of its save', () => {
    const { owner, actorId, itemId } = caster();
    castSpell(store, owner, {
      actorId,
      itemId: itemId['invented-burst'] as string,
      entryId: PREPARED_ID,
    });

    const entry = sheetOf(actorId).spellcasting[0];
    expect(entry?.kind === 'prepared' ? entry.prepared[0]?.expended : undefined).toBe(
      true,
    );
    // 10 + 4 (Intelligence) + 3 (trained, level 1).
    expect(lastCard()).toMatchObject({
      spellName: 'invented-burst',
      castRank: 1,
      cost: 'slot',
      overspent: false,
      tradition: 'arcane',
      dc: 17,
      save: 'reflex',
      basic: true,
      text: 'The text of invented-burst.',
    });
  });

  it('casting it again is allowed, says nothing was left, and changes nothing (ADR 0023)', () => {
    const { owner, actorId, itemId } = caster();
    const cast = () =>
      castSpell(store, owner, {
        actorId,
        itemId: itemId['invented-burst'] as string,
        entryId: PREPARED_ID,
      });
    cast();
    cast();
    expect(lastCard()).toMatchObject({ overspent: true });
    const entry = sheetOf(actorId).spellcasting[0];
    expect(
      entry?.kind === 'prepared' ? entry.prepared.map((p) => p.expended) : [],
    ).toEqual([true]);
  });

  it('counts a spontaneous slot used, past the maximum, with the overspent flag on the second', () => {
    const { owner, actorId, itemId } = caster();
    const cast = () =>
      castSpell(store, owner, {
        actorId,
        itemId: itemId['invented-bolt'] as string,
        entryId: SPONTANEOUS_ID,
      });
    cast();
    expect(lastCard()?.overspent).toBe(false);
    cast();
    expect(lastCard()?.overspent).toBe(true);
    const entry = sheetOf(actorId).spellcasting[1];
    expect(entry?.kind === 'spontaneous' ? entry.slots['1'] : undefined).toEqual({
      max: 1,
      used: 2,
    });
  });

  it('puts the spell attack bonus on the card for an attack spell', () => {
    const { owner, actorId, itemId } = caster();
    castSpell(store, owner, {
      actorId,
      itemId: itemId['invented-bolt'] as string,
      entryId: SPONTANEOUS_ID,
    });
    // 4 (Intelligence) + 3 (trained, level 1).
    expect(lastCard()).toMatchObject({ attackBonus: 7 });
    expect(lastCard()).not.toHaveProperty('dc');
  });

  it('a cantrip costs nothing, and is the caster’s rank (half level, rounded up)', () => {
    const { owner, actorId, itemId } = caster();
    castSpell(store, owner, { actorId, itemId: itemId['invented-spark'] as string });
    expect(lastCard()).toMatchObject({ cost: 'cantrip', castRank: 1, overspent: false });
    const prepared = sheetOf(actorId).spellcasting[0];
    expect(
      prepared?.kind === 'prepared' ? prepared.prepared[0]?.expended : undefined,
    ).toBe(false);
    const entry = sheetOf(actorId).spellcasting[1];
    expect(entry?.kind === 'spontaneous' ? entry.slots['1']?.used : undefined).toBe(0);
  });

  it('a focus spell spends a focus point, and with none left is overspent and stays at zero', () => {
    const { owner, actorId, itemId } = caster();
    const flare = itemId['invented-flare'] as string;
    castSpell(store, owner, { actorId, itemId: flare, focus: true });
    expect(sheetOf(actorId).focusPoints.current).toBe(0);
    expect(lastCard()).toMatchObject({ cost: 'focus', overspent: false });

    castSpell(store, owner, { actorId, itemId: flare, focus: true });
    expect(sheetOf(actorId).focusPoints.current).toBe(0);
    expect(lastCard()?.overspent).toBe(true);
  });

  it('heightens to the rank asked for', () => {
    const { owner, actorId, itemId } = caster();
    castSpell(store, owner, {
      actorId,
      itemId: itemId['invented-bolt'] as string,
      entryId: SPONTANEOUS_ID,
      rank: 3,
    });
    expect(lastCard()?.castRank).toBe(3);
    const entry = sheetOf(actorId).spellcasting[1];
    expect(entry?.kind === 'spontaneous' ? entry.slots['3'] : undefined).toEqual({
      max: 0,
      used: 1,
    });
  });

  it('rejects data problems: not a spell, no entry named, an unknown entry, a missing item', () => {
    const { owner, actorId, itemId } = caster();
    const spellId = itemId['invented-bolt'] as string;
    expect(() =>
      castSpell(store, owner, { actorId, itemId: itemId['rope'] as string }),
    ).toThrow(OperationRejected);
    expect(() => castSpell(store, owner, { actorId, itemId: spellId })).toThrow(
      /name the spellcasting entry/,
    );
    expect(() =>
      castSpell(store, owner, { actorId, itemId: spellId, entryId: crypto.randomUUID() }),
    ).toThrow(OperationRejected);
    expect(() =>
      castSpell(store, owner, {
        actorId,
        itemId: crypto.randomUUID(),
        entryId: PREPARED_ID,
      }),
    ).toThrow(OperationRejected);
  });

  it('is for the owner or the GM, not another player', () => {
    const { actorId, itemId } = caster();
    const stranger = makeSeat({ name: 'Stranger' });
    expect(() =>
      castSpell(store, stranger, {
        actorId,
        itemId: itemId['invented-spark'] as string,
      }),
    ).toThrow(OperationRejected);
    const gm = makeSeat({ name: 'GM', isGM: true });
    expect(() =>
      castSpell(store, gm, { actorId, itemId: itemId['invented-spark'] as string }),
    ).not.toThrow();
  });

  it('lets the spell attack be rolled as a check, labelled as one', () => {
    const { owner, actorId } = caster();
    const message = rollActorCheck(store, owner, () => 0.5, {
      actorId,
      statistic: `spellAttack:${PREPARED_ID}`,
    });
    expect(message.label).toBe('Spell attack');
    expect(message.breakdown.total).toBe(7);
  });
});

describe('actor.refocus and actor.restSpells', () => {
  it('refocus regains one focus point, up to the maximum', () => {
    const { owner, actorId, itemId } = caster();
    castSpell(store, owner, {
      actorId,
      itemId: itemId['invented-flare'] as string,
      focus: true,
    });
    refocus(store, owner, { actorId });
    expect(sheetOf(actorId).focusPoints.current).toBe(1);
    refocus(store, owner, { actorId });
    expect(sheetOf(actorId).focusPoints.current).toBe(1);
  });

  it('resting frees every slot and leaves the focus pool and the prepared spells alone', () => {
    const { owner, actorId, itemId } = caster();
    castSpell(store, owner, {
      actorId,
      itemId: itemId['invented-burst'] as string,
      entryId: PREPARED_ID,
    });
    castSpell(store, owner, {
      actorId,
      itemId: itemId['invented-bolt'] as string,
      entryId: SPONTANEOUS_ID,
    });
    castSpell(store, owner, {
      actorId,
      itemId: itemId['invented-flare'] as string,
      focus: true,
    });

    restSpells(store, owner, { actorId });

    const [prepared, spontaneous] = sheetOf(actorId).spellcasting;
    expect(
      prepared?.kind === 'prepared' ? prepared.prepared.map((p) => p.expended) : [],
    ).toEqual([false]);
    expect(
      spontaneous?.kind === 'spontaneous' ? spontaneous.slots['1'] : undefined,
    ).toEqual({ max: 1, used: 0 });
    expect(sheetOf(actorId).focusPoints.current).toBe(0);
  });
});
