import type { ConditionDuration } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { describeDuration } from './conditionDuration.js';

const noLabel = () => undefined;
const goblinLabel = (id: string) => (id === 'c1' ? 'Goblin' : undefined);

describe('describeDuration', () => {
  it('says nothing for an absent duration, or an explicit untilRemoved', () => {
    expect(describeDuration(undefined, noLabel)).toBeUndefined();
    expect(describeDuration({ type: 'untilRemoved' }, noLabel)).toBeUndefined();
  });

  it('names the combatant and which end of their turn', () => {
    const atEnd: ConditionDuration = {
      type: 'turn',
      combatantId: 'c1',
      boundary: 'end',
    };
    expect(describeDuration(atEnd, goblinLabel)).toBe("Ends at the end of Goblin's turn");

    const atStart: ConditionDuration = {
      type: 'turn',
      combatantId: 'c1',
      boundary: 'start',
    };
    expect(describeDuration(atStart, goblinLabel)).toBe(
      "Ends at the start of Goblin's turn",
    );
  });

  it('falls back in words when the combatant is not found', () => {
    const duration: ConditionDuration = {
      type: 'turn',
      combatantId: 'gone',
      boundary: 'end',
    };
    expect(describeDuration(duration, noLabel)).toBe(
      "Ends at the end of an unknown combatant's turn",
    );
  });

  it('counts rounds, singular and plural', () => {
    expect(describeDuration({ type: 'rounds', remaining: 1 }, noLabel)).toBe(
      '1 round left',
    );
    expect(describeDuration({ type: 'rounds', remaining: 3 }, noLabel)).toBe(
      '3 rounds left',
    );
  });

  it('says sustained conditions end by hand', () => {
    expect(describeDuration({ type: 'sustained' }, noLabel)).toBe(
      'Sustained (ends by hand)',
    );
  });

  it('says a calendar duration ends by hand until the Calendar exists', () => {
    expect(describeDuration({ type: 'minutes', remaining: 10 }, noLabel)).toBe(
      '10 minutes (ends by hand until the Calendar exists)',
    );
    expect(describeDuration({ type: 'hours', remaining: 2 }, noLabel)).toBe(
      '2 hours (ends by hand until the Calendar exists)',
    );
    expect(describeDuration({ type: 'days', remaining: 1 }, noLabel)).toBe(
      '1 days (ends by hand until the Calendar exists)',
    );
  });
});
