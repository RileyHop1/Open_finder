import type { TurnState } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import type { AppliedCondition } from '../content/character.js';
import type { TurnParticipant } from './turnBoundaries.js';
import { endOfTurn, startOfTurn } from './turnBoundaries.js';

const FRESH: TurnState = { actionsSpent: 0, reactionUsed: false, attacksMade: 0 };
const SPENT: TurnState = { actionsSpent: 3, reactionUsed: true, attacksMade: 2 };

const VALEROS = '11111111-1111-4111-8111-111111111111';
const GOBLIN = '22222222-2222-4222-8222-222222222222';
const WITCH = '33333333-3333-4333-8333-333333333333';

function who(
  combatantId: string,
  conditions: AppliedCondition[] = [],
  turn: TurnState = FRESH,
): TurnParticipant {
  return { combatantId, conditions, turn };
}

const untilEndOf = (combatantId: string): AppliedCondition['duration'] => ({
  type: 'turn',
  combatantId,
  boundary: 'end',
});
const untilStartOf = (combatantId: string): AppliedCondition['duration'] => ({
  type: 'turn',
  combatantId,
  boundary: 'start',
});

describe('startOfTurn -- the turn resets', () => {
  it('refreshes the reaction, the attack count, and the actions of the one whose turn it is', () => {
    const result = startOfTurn([who(VALEROS, [], SPENT), who(GOBLIN)], VALEROS);
    expect(result.changes).toEqual([
      { combatantId: VALEROS, conditions: [], turn: FRESH },
    ]);
    expect(result.events).toEqual([]);
  });

  it('does not touch anyone else, including someone who has spent their reaction', () => {
    const result = startOfTurn([who(VALEROS), who(GOBLIN, [], { ...SPENT })], VALEROS);
    expect(result.changes).toEqual([]);
  });

  it('reports no change for a combatant that is already fresh', () => {
    expect(startOfTurn([who(VALEROS)], VALEROS).changes).toEqual([]);
  });
});

describe('startOfTurn -- durations', () => {
  it('ends a condition that lasts until the start of the active combatant’s turn, on anyone', () => {
    const held: AppliedCondition = {
      slug: 'off-guard',
      duration: untilStartOf(VALEROS),
    };
    const result = startOfTurn(
      [who(VALEROS), who(GOBLIN, [held, { slug: 'prone' }])],
      VALEROS,
    );
    expect(result.changes).toEqual([
      { combatantId: GOBLIN, conditions: [{ slug: 'prone' }], turn: FRESH },
    ]);
    expect(result.events).toEqual([
      { kind: 'expired', combatantId: GOBLIN, slug: 'off-guard' },
    ]);
  });

  it('leaves a start-of-turn condition alone on someone else’s turn', () => {
    const held: AppliedCondition = { slug: 'off-guard', duration: untilStartOf(WITCH) };
    expect(startOfTurn([who(GOBLIN, [held])], VALEROS).changes).toEqual([]);
  });

  it('leaves an end-of-turn condition alone at the start of the same turn', () => {
    const held: AppliedCondition = { slug: 'prone', duration: untilEndOf(VALEROS) };
    expect(startOfTurn([who(VALEROS, [held])], VALEROS).changes).toEqual([]);
  });

  it('counts a rounds duration down at the start of its bearer’s own turn', () => {
    const sickened: AppliedCondition = {
      slug: 'sickened',
      value: 1,
      duration: { type: 'rounds', remaining: 3 },
    };
    const result = startOfTurn([who(VALEROS, [sickened])], VALEROS);
    expect(result.changes[0]?.conditions).toEqual([
      { slug: 'sickened', value: 1, duration: { type: 'rounds', remaining: 2 } },
    ]);
    expect(result.events).toEqual([
      { kind: 'ticked', combatantId: VALEROS, slug: 'sickened', remaining: 2 },
    ]);
  });

  it('ends a rounds duration that reaches zero', () => {
    const dazzled: AppliedCondition = {
      slug: 'dazzled',
      duration: { type: 'rounds', remaining: 1 },
    };
    const result = startOfTurn([who(VALEROS, [dazzled])], VALEROS);
    expect(result.changes[0]?.conditions).toEqual([]);
    expect(result.events).toEqual([
      { kind: 'expired', combatantId: VALEROS, slug: 'dazzled' },
    ]);
  });

  it('does not tick a rounds duration on someone else’s turn', () => {
    const dazzled: AppliedCondition = {
      slug: 'dazzled',
      duration: { type: 'rounds', remaining: 1 },
    };
    expect(startOfTurn([who(GOBLIN, [dazzled])], VALEROS).changes).toEqual([]);
  });

  it('never touches calendar durations, sustained, or until removed', () => {
    const conditions: AppliedCondition[] = [
      { slug: 'a', duration: { type: 'minutes', remaining: 1 } },
      { slug: 'b', duration: { type: 'hours', remaining: 1 } },
      { slug: 'c', duration: { type: 'days', remaining: 1 } },
      { slug: 'd', duration: { type: 'sustained' } },
      { slug: 'e', duration: { type: 'untilRemoved' } },
      { slug: 'f' },
    ];
    expect(startOfTurn([who(VALEROS, conditions)], VALEROS).changes).toEqual([]);
    expect(endOfTurn([who(VALEROS, conditions)], VALEROS).changes).toEqual([]);
  });

  it('does not change its input', () => {
    const conditions: AppliedCondition[] = [
      { slug: 'sickened', value: 1, duration: { type: 'rounds', remaining: 2 } },
    ];
    const participant = who(VALEROS, conditions, SPENT);
    startOfTurn([participant], VALEROS);
    expect(conditions).toEqual([
      { slug: 'sickened', value: 1, duration: { type: 'rounds', remaining: 2 } },
    ]);
    expect(participant.turn).toEqual(SPENT);
  });
});

describe('endOfTurn', () => {
  it('ends a condition that lasts until the end of the active combatant’s turn, on anyone', () => {
    const held: AppliedCondition = { slug: 'grabbed', duration: untilEndOf(VALEROS) };
    const result = endOfTurn([who(VALEROS), who(GOBLIN, [held])], VALEROS);
    expect(result.changes).toEqual([
      { combatantId: GOBLIN, conditions: [], turn: FRESH },
    ]);
    expect(result.events).toEqual([
      { kind: 'expired', combatantId: GOBLIN, slug: 'grabbed' },
    ]);
  });

  it('leaves an end-of-turn condition tied to someone else', () => {
    const held: AppliedCondition = { slug: 'grabbed', duration: untilEndOf(WITCH) };
    expect(endOfTurn([who(GOBLIN, [held])], VALEROS).changes).toEqual([]);
  });

  it('does not reset the turn: that happens at the start of the next one', () => {
    const held: AppliedCondition = { slug: 'prone', duration: untilEndOf(VALEROS) };
    const result = endOfTurn([who(VALEROS, [held], SPENT)], VALEROS);
    expect(result.changes[0]?.turn).toEqual(SPENT);
  });
});

describe('endOfTurn -- frightened', () => {
  const frightened = (value: number): AppliedCondition => ({ slug: 'frightened', value });

  it('lowers frightened by one for the one whose turn is ending', () => {
    const result = endOfTurn([who(VALEROS, [frightened(2)])], VALEROS);
    expect(result.changes[0]?.conditions).toEqual([frightened(1)]);
    expect(result.events).toEqual([
      { kind: 'reduced', combatantId: VALEROS, slug: 'frightened', from: 2, to: 1 },
    ]);
  });

  it('ends frightened 1', () => {
    const result = endOfTurn([who(VALEROS, [frightened(1)])], VALEROS);
    expect(result.changes[0]?.conditions).toEqual([]);
    expect(result.events).toEqual([
      { kind: 'reduced', combatantId: VALEROS, slug: 'frightened', from: 1, to: 0 },
    ]);
  });

  it('leaves frightened alone on everyone else’s turn', () => {
    expect(endOfTurn([who(GOBLIN, [frightened(3)])], VALEROS).changes).toEqual([]);
  });

  it('keeps the rest of the list, in order, and the duration on frightened', () => {
    const timed: AppliedCondition = {
      slug: 'frightened',
      value: 3,
      duration: { type: 'minutes', remaining: 1 },
    };
    const result = endOfTurn(
      [who(VALEROS, [{ slug: 'prone' }, timed, { slug: 'clumsy', value: 1 }])],
      VALEROS,
    );
    expect(result.changes[0]?.conditions).toEqual([
      { slug: 'prone' },
      { slug: 'frightened', value: 2, duration: { type: 'minutes', remaining: 1 } },
      { slug: 'clumsy', value: 1 },
    ]);
  });

  it('does not lower it twice when it also ends with the turn', () => {
    const both: AppliedCondition = {
      slug: 'frightened',
      value: 2,
      duration: untilEndOf(VALEROS),
    };
    const result = endOfTurn([who(VALEROS, [both])], VALEROS);
    expect(result.changes[0]?.conditions).toEqual([]);
    expect(result.events).toEqual([
      { kind: 'expired', combatantId: VALEROS, slug: 'frightened' },
    ]);
  });
});

describe('startOfTurn -- stunned', () => {
  const stunned = (value: number): AppliedCondition => ({ slug: 'stunned', value });

  it('takes that many actions, counts them as spent, and wears off by that many', () => {
    const result = startOfTurn([who(VALEROS, [stunned(3)], SPENT)], VALEROS);
    expect(result.changes).toEqual([
      {
        combatantId: VALEROS,
        conditions: [],
        turn: { actionsSpent: 3, reactionUsed: false, attacksMade: 0 },
      },
    ]);
    expect(result.events).toEqual([
      { kind: 'actionsLost', combatantId: VALEROS, slug: 'stunned', count: 3 },
      { kind: 'reduced', combatantId: VALEROS, slug: 'stunned', from: 3, to: 0 },
    ]);
  });

  it('loses only what the turn has when stunned is bigger, and keeps the rest', () => {
    const result = startOfTurn([who(VALEROS, [stunned(4)])], VALEROS);
    expect(result.changes[0]?.turn.actionsSpent).toBe(3);
    expect(result.changes[0]?.conditions).toEqual([stunned(1)]);
  });

  it('takes one action and ends at stunned 1', () => {
    const result = startOfTurn([who(VALEROS, [stunned(1), { slug: 'prone' }])], VALEROS);
    expect(result.changes[0]?.turn.actionsSpent).toBe(1);
    expect(result.changes[0]?.conditions).toEqual([{ slug: 'prone' }]);
  });

  it('takes from what slowed leaves, so slowed 2 and stunned 2 lose one action', () => {
    const conditions: AppliedCondition[] = [{ slug: 'slowed', value: 2 }, stunned(2)];
    const result = startOfTurn([who(VALEROS, conditions)], VALEROS);
    expect(result.changes[0]?.turn.actionsSpent).toBe(1);
    expect(result.changes[0]?.conditions).toEqual([
      { slug: 'slowed', value: 2 },
      stunned(1),
    ]);
  });

  it('takes nothing, and does not wear off, when slowed has already taken every action', () => {
    const conditions: AppliedCondition[] = [{ slug: 'slowed', value: 3 }, stunned(2)];
    expect(startOfTurn([who(VALEROS, conditions)], VALEROS).changes).toEqual([]);
  });

  it('does not touch anyone else’s stunned', () => {
    expect(startOfTurn([who(GOBLIN, [stunned(2)])], VALEROS).changes).toEqual([]);
  });

  it('does not take actions from a stunned that ends at the start of this same turn', () => {
    const ending: AppliedCondition = {
      slug: 'stunned',
      value: 2,
      duration: untilStartOf(VALEROS),
    };
    const result = startOfTurn([who(VALEROS, [ending])], VALEROS);
    expect(result.changes[0]?.turn.actionsSpent).toBe(0);
    expect(result.events).toEqual([
      { kind: 'expired', combatantId: VALEROS, slug: 'stunned' },
    ]);
  });
});

describe('persistent damage at the end of a turn', () => {
  const fire = {
    id: '00000000-0000-4000-8000-0000000000aa',
    formula: '1d6',
    damageType: 'fire',
  };
  const bleed = {
    id: '00000000-0000-4000-8000-0000000000bb',
    formula: '1d4',
    damageType: 'bleed',
  };
  const burning = (
    combatantId: string,
    ...entries: (typeof fire)[]
  ): TurnParticipant => ({
    combatantId,
    conditions: [],
    turn: FRESH,
    persistentDamage: entries,
  });

  it('hands back what is due for the one whose turn is ending, in order', () => {
    const result = endOfTurn(
      [burning(VALEROS, fire, bleed), burning(GOBLIN, fire)],
      VALEROS,
    );
    expect(result.persistentDue).toEqual([
      { combatantId: VALEROS, entries: [fire, bleed] },
    ]);
  });

  it('hands back nothing for a bearer with none, or for anyone else’s turn', () => {
    expect(endOfTurn([who(VALEROS)], VALEROS).persistentDue).toEqual([]);
    expect(endOfTurn([burning(GOBLIN, fire)], VALEROS).persistentDue).toEqual([]);
  });

  it('hands back nothing at the start of a turn', () => {
    expect(startOfTurn([burning(VALEROS, fire)], VALEROS).persistentDue).toEqual([]);
  });

  it('does not change the other end-of-turn results', () => {
    const frightened: AppliedCondition = { slug: 'frightened', value: 2 };
    const result = endOfTurn(
      [{ ...burning(VALEROS, fire), conditions: [frightened] }],
      VALEROS,
    );
    expect(result.changes[0]?.conditions).toEqual([{ slug: 'frightened', value: 1 }]);
    expect(result.persistentDue).toHaveLength(1);
  });
});
