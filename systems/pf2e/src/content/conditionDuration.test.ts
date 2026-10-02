import { describe, expect, it } from 'vitest';

import { appliedConditionSchema } from './character.js';
import { conditionDurationSchema } from './conditionDuration.js';
import { npcDataSchema } from './npc.js';

const COMBATANT = '4b1e7c20-9d3a-4f6e-8c11-2a5d7e9f0b34';

describe('conditionDurationSchema', () => {
  it('parses every kind', () => {
    for (const duration of [
      { type: 'untilRemoved' },
      { type: 'turn', combatantId: COMBATANT, boundary: 'end' },
      { type: 'turn', combatantId: COMBATANT, boundary: 'start' },
      { type: 'rounds', remaining: 3 },
      { type: 'sustained' },
      { type: 'minutes', remaining: 10 },
      { type: 'hours', remaining: 1 },
      { type: 'days', remaining: 2 },
    ]) {
      expect(conditionDurationSchema.parse(duration)).toEqual(duration);
    }
  });

  it('rejects an unknown kind, a missing or malformed combatant, and a bad boundary', () => {
    for (const duration of [
      { type: 'forever' },
      { type: 'turn', boundary: 'end' },
      { type: 'turn', combatantId: 'nope', boundary: 'end' },
      { type: 'turn', combatantId: COMBATANT, boundary: 'middle' },
    ]) {
      expect(conditionDurationSchema.safeParse(duration).success).toBe(false);
    }
  });

  it('rejects a count that is zero, negative, a fraction, or past its bound', () => {
    for (const duration of [
      { type: 'rounds', remaining: 0 },
      { type: 'rounds', remaining: -1 },
      { type: 'rounds', remaining: 1.5 },
      { type: 'rounds', remaining: 100 },
      { type: 'minutes', remaining: 0 },
      { type: 'hours', remaining: 10_000 },
      { type: 'days', remaining: 'three' },
      { type: 'rounds' },
    ]) {
      expect(conditionDurationSchema.safeParse(duration).success).toBe(false);
    }
  });
});

describe('a condition stored before durations existed', () => {
  it('still parses, with no duration, which means until removed', () => {
    expect(appliedConditionSchema.parse({ slug: 'frightened', value: 2 })).toEqual({
      slug: 'frightened',
      value: 2,
    });
    expect(appliedConditionSchema.parse({ slug: 'prone' }).duration).toBeUndefined();
  });

  it('keeps a duration when there is one', () => {
    const duration = { type: 'rounds', remaining: 2 } as const;
    expect(
      appliedConditionSchema.parse({ slug: 'sickened', value: 1, duration }),
    ).toEqual({ slug: 'sickened', value: 1, duration });
  });

  it('rejects a condition whose duration is malformed', () => {
    expect(
      appliedConditionSchema.safeParse({ slug: 'prone', duration: { type: 'rounds' } })
        .success,
    ).toBe(false);
  });

  it('is unchanged inside a monster that was stored with conditions', () => {
    const creature = {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      packId: 'bestiary',
      slug: 'invented-bog-strangler',
      name: 'Invented Bog Strangler',
      kind: 'creature',
      provenance: {
        publication: 'Pathfinder Monster Core',
        license: 'ORC',
        remaster: true,
      },
      level: 3,
      size: 'large',
      perception: 8,
      ac: 19,
      savingThrows: { fortitude: 10, reflex: 6, will: 7 },
      hp: 45,
      speeds: { land: 25 },
      attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
    };
    const stored = {
      creature,
      hp: { current: 45 },
      conditions: [{ slug: 'frightened', value: 2 }, { slug: 'prone' }],
    };
    const parsed = npcDataSchema.parse(stored);
    expect(parsed.conditions).toEqual([
      { slug: 'frightened', value: 2 },
      { slug: 'prone' },
    ]);
  });
});
