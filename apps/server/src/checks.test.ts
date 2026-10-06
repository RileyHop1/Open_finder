import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Seat } from '@hearthtable/core';
import { chatCheckMessageSchema } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createActor, updateActor } from './actors.js';
import { rollActorCheck } from './checks.js';
import { emptyCompendium } from './compendium.js';
import { addConditionToActor } from './conditions.js';
import { createWorld, type WorldStore } from './worldStore.js';

let worldsRoot: string;
let store: WorldStore;

beforeEach(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'hearthtable-checks-test-'));
  store = createWorld(worldsRoot, 'Test Campaign');
});

afterEach(() => {
  store.close();
  rmSync(worldsRoot, { recursive: true, force: true });
});

const NOW = '2026-09-30T00:00:00.000Z';

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

/** A level 1 character with Str +4 and Athletics trained: +4 +2 +1 = +7. */
function athlete() {
  const owner = makeSeat();
  const actor = createActor(store, owner, { kind: 'character', name: 'Hero' });
  updateActor(store, owner, {
    actorId: actor.id,
    changes: { 'system.attributes.str': 4, 'system.ranks.skills.athletics': 'trained' },
  });
  return { owner, actorId: actor.id };
}

describe('rollActorCheck', () => {
  it('adds the roller’s situational modifiers, and leaves the roll alone without any', () => {
    const { owner, actorId } = athlete();
    const plain = rollActorCheck(store, owner, fixed(11), {
      actorId,
      statistic: 'skill:athletics',
      modifiers: [],
    });
    expect(plain.breakdown.total).toBe(7);

    const message = rollActorCheck(store, owner, fixed(11), {
      actorId,
      statistic: 'skill:athletics',
      modifiers: [{ value: 2, label: 'Bless' }, { value: 1 }],
    });
    expect(message.breakdown.total).toBe(10);
    expect(message.roll).toMatchObject({ expression: '1d20+10', total: 21 });
    expect(message.breakdown.modifiers.map((m) => [m.label, m.value])).toEqual(
      expect.arrayContaining([
        ['Bless', 2],
        ['Situational', 1],
      ]),
    );
  });

  it('rolls the resolved skill and stores a structured check message', () => {
    const { owner, actorId } = athlete();

    const message = rollActorCheck(store, owner, fixed(11), {
      actorId,
      statistic: 'skill:athletics',
    });

    expect(message).toMatchObject({
      kind: 'check',
      seatId: owner.id,
      actorId,
      actorName: 'Hero',
      statistic: 'skill:athletics',
      label: 'Athletics',
      breakdown: { total: 7 },
      roll: { expression: '1d20+7', total: 18, natural: 11 },
    });
    expect(message.dc).toBeUndefined();
    expect(message.roll.degree).toBeUndefined();
    expect(chatCheckMessageSchema.parse(store.getDocument(message.id))).toEqual(message);
  });

  it('keeps every modifier in the breakdown, so the hover view has the real data', () => {
    const { owner, actorId } = athlete();
    const { breakdown } = rollActorCheck(store, owner, fixed(1), {
      actorId,
      statistic: 'skill:athletics',
    });
    expect(breakdown.modifiers.map((m) => [m.type, m.value, m.applied])).toEqual(
      expect.arrayContaining([['ability', 4, true]]),
    );
  });

  it('adds a degree of success when a DC is given', () => {
    const { owner, actorId } = athlete();
    const message = rollActorCheck(store, owner, fixed(13), {
      actorId,
      statistic: 'skill:athletics',
      dc: 20,
    });
    expect(message.dc).toBe(20);
    expect(message.roll.total).toBe(20);
    expect(message.roll.degree).toBe('success');
  });

  it('rolls Perception and a save, with readable labels', () => {
    const { owner, actorId } = athlete();
    expect(
      rollActorCheck(store, owner, fixed(5), { actorId, statistic: 'perception' }).label,
    ).toBe('Perception');
    expect(
      rollActorCheck(store, owner, fixed(5), { actorId, statistic: 'fortitude' }).label,
    ).toBe('Fortitude');
  });

  it('reflects a condition: frightened lowers the roll the server makes', () => {
    const { owner, actorId } = athlete();
    addConditionToActor(store, owner, emptyCompendium(), {
      actorId,
      slug: 'frightened',
      value: 2,
    });
    const message = rollActorCheck(store, owner, fixed(10), {
      actorId,
      statistic: 'skill:athletics',
    });
    expect(message.breakdown.total).toBe(5);
    expect(message.roll.total).toBe(15);
  });

  it('refuses a statistic that is not a d20 bonus, or does not exist', () => {
    const { owner, actorId } = athlete();
    for (const statistic of ['ac', 'classDc', 'hp', 'skill:no-such-skill', 'nonsense']) {
      expect(() =>
        rollActorCheck(store, owner, fixed(10), { actorId, statistic }),
      ).toThrow(/cannot be rolled as a check/);
    }
    expect(store.listDocuments('chatMessage')).toEqual([]);
  });

  it('lets the GM roll for anyone, and refuses another player or an NPC with no creature', () => {
    const { actorId } = athlete();
    const asGm = rollActorCheck(store, makeSeat({ isGM: true }), fixed(10), {
      actorId,
      statistic: 'perception',
    });
    expect(asGm.actorId).toBe(actorId);
    expect(() =>
      rollActorCheck(store, makeSeat(), fixed(10), { actorId, statistic: 'perception' }),
    ).toThrow(/do not have permission/);

    const owner = makeSeat();
    const npc = createActor(store, owner, { kind: 'npc', name: 'Innkeeper' });
    expect(() =>
      rollActorCheck(store, owner, fixed(10), {
        actorId: npc.id,
        statistic: 'perception',
      }),
    ).toThrow(/has no creature stats to roll/);
  });
});
