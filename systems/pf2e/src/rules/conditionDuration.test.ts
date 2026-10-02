import { describe, expect, it } from 'vitest';

import type { ConditionDuration } from '../content/conditionDuration.js';
import { durationSeconds, longerDuration } from './conditionDuration.js';

const COMBATANT = '4b1e7c20-9d3a-4f6e-8c11-2a5d7e9f0b34';

describe('durationSeconds', () => {
  it('counts a round as 6 seconds and a turn as one round', () => {
    expect(durationSeconds({ type: 'rounds', remaining: 3 })).toBe(18);
    expect(
      durationSeconds({ type: 'turn', combatantId: COMBATANT, boundary: 'end' }),
    ).toBe(6);
  });

  it('counts calendar time in seconds, and sustained as a minute', () => {
    expect(durationSeconds({ type: 'minutes', remaining: 10 })).toBe(600);
    expect(durationSeconds({ type: 'hours', remaining: 1 })).toBe(3600);
    expect(durationSeconds({ type: 'days', remaining: 1 })).toBe(86_400);
    expect(durationSeconds({ type: 'sustained' })).toBe(60);
  });

  it('lasts forever with no duration, or until removed', () => {
    expect(durationSeconds(undefined)).toBe(Number.POSITIVE_INFINITY);
    expect(durationSeconds({ type: 'untilRemoved' })).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('longerDuration', () => {
  const turn: ConditionDuration = {
    type: 'turn',
    combatantId: COMBATANT,
    boundary: 'end',
  };
  const threeRounds: ConditionDuration = { type: 'rounds', remaining: 3 };
  const tenMinutes: ConditionDuration = { type: 'minutes', remaining: 10 };

  it('keeps the longer of two, in either order', () => {
    expect(longerDuration(turn, threeRounds)).toEqual(threeRounds);
    expect(longerDuration(threeRounds, turn)).toEqual(threeRounds);
    expect(longerDuration(threeRounds, tenMinutes)).toEqual(tenMinutes);
    expect(longerDuration(tenMinutes, threeRounds)).toEqual(tenMinutes);
  });

  it('ranks until removed, or no duration, above anything timed', () => {
    expect(longerDuration(tenMinutes, undefined)).toBeUndefined();
    expect(longerDuration(undefined, tenMinutes)).toBeUndefined();
    expect(longerDuration(tenMinutes, { type: 'untilRemoved' })).toEqual({
      type: 'untilRemoved',
    });
  });

  it('keeps the existing one on a tie, so applying the same thing twice changes nothing', () => {
    const existing: ConditionDuration = { type: 'rounds', remaining: 10 };
    const incoming: ConditionDuration = { type: 'minutes', remaining: 1 };
    expect(longerDuration(existing, incoming)).toBe(existing);
    expect(longerDuration(undefined, undefined)).toBeUndefined();
  });
});
