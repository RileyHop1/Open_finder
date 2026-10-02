import { describe, expect, it } from 'vitest';

import type { AppliedCondition, ConditionEntry } from '../index.js';
import type { ConditionDefinitions } from './conditionMerge.js';
import { addCondition, removeCondition, setCondition } from './conditionMerge.js';

const IMPORTED_AT = '2026-09-30T00:00:00.000Z';

function definition(
  slug: string,
  fields: Partial<
    Pick<ConditionEntry, 'valued' | 'maxValue' | 'group' | 'overrides'>
  > = {},
): ConditionEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
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

const DEFINITIONS: ConditionDefinitions = new Map(
  [
    definition('frightened', { valued: true, maxValue: 4 }),
    definition('clumsy', { valued: true }),
    definition('prone'),
    // An invented mutually exclusive ladder, standing in for the detection states.
    definition('observed', { group: 'ladder' }),
    definition('hidden', { group: 'ladder' }),
    definition('undetected', { group: 'ladder' }),
    // An invented condition that supersedes another by name.
    definition('paralyzed-like', { overrides: ['prone'] }),
  ].map((entry) => [entry.slug, entry]),
);

const frightened = (value: number): AppliedCondition => ({ slug: 'frightened', value });

describe('addCondition -- valued conditions', () => {
  it('keeps the higher value from two sources, in either order', () => {
    expect(addCondition([frightened(2)], frightened(1), DEFINITIONS)).toEqual([
      frightened(2),
    ]);
    expect(addCondition([frightened(1)], frightened(2), DEFINITIONS)).toEqual([
      frightened(2),
    ]);
  });

  it('never sums two sources', () => {
    expect(addCondition([frightened(2)], frightened(2), DEFINITIONS)).toEqual([
      frightened(2),
    ]);
  });

  it('keeps the entry in place when it is raised, and appends a new one', () => {
    const current: AppliedCondition[] = [frightened(1), { slug: 'prone' }];
    expect(addCondition(current, frightened(3), DEFINITIONS)).toEqual([
      frightened(3),
      { slug: 'prone' },
    ]);
    expect(addCondition(current, { slug: 'clumsy', value: 1 }, DEFINITIONS)).toEqual([
      frightened(1),
      { slug: 'prone' },
      { slug: 'clumsy', value: 1 },
    ]);
  });

  it('clamps to the definition maximum and to at least 1', () => {
    expect(addCondition([], frightened(9), DEFINITIONS)).toEqual([frightened(4)]);
    expect(addCondition([], frightened(0), DEFINITIONS)).toEqual([frightened(1)]);
  });

  it('treats a valued condition added without a value as value 1', () => {
    expect(addCondition([], { slug: 'frightened' }, DEFINITIONS)).toEqual([
      frightened(1),
    ]);
  });

  it('does not cap a valued condition that has no maximum', () => {
    expect(addCondition([], { slug: 'clumsy', value: 7 }, DEFINITIONS)).toEqual([
      { slug: 'clumsy', value: 7 },
    ]);
  });
});

describe('addCondition -- binary conditions', () => {
  it('is idempotent and strips a stray value', () => {
    const once = addCondition([], { slug: 'prone', value: 3 }, DEFINITIONS);
    expect(once).toEqual([{ slug: 'prone' }]);
    expect(addCondition(once, { slug: 'prone' }, DEFINITIONS)).toEqual(once);
  });
});

describe('addCondition -- without a definition', () => {
  it('treats a condition as valued only if it arrives with a value', () => {
    expect(addCondition([], { slug: 'mystery', value: 2 })).toEqual([
      { slug: 'mystery', value: 2 },
    ]);
    expect(addCondition([], { slug: 'mystery' })).toEqual([{ slug: 'mystery' }]);
  });

  it('still merges to the higher value', () => {
    expect(
      addCondition([{ slug: 'mystery', value: 3 }], { slug: 'mystery', value: 1 }),
    ).toEqual([{ slug: 'mystery', value: 3 }]);
  });
});

describe('addCondition -- clearing what is superseded', () => {
  it('clears the other members of a mutually exclusive group', () => {
    const current: AppliedCondition[] = [{ slug: 'observed' }, { slug: 'prone' }];
    expect(addCondition(current, { slug: 'hidden' }, DEFINITIONS)).toEqual([
      { slug: 'prone' },
      { slug: 'hidden' },
    ]);
    expect(
      addCondition([{ slug: 'hidden' }], { slug: 'undetected' }, DEFINITIONS),
    ).toEqual([{ slug: 'undetected' }]);
  });

  it('clears the conditions named in overrides', () => {
    expect(
      addCondition(
        [{ slug: 'prone' }, frightened(1)],
        { slug: 'paralyzed-like' },
        DEFINITIONS,
      ),
    ).toEqual([frightened(1), { slug: 'paralyzed-like' }]);
  });

  it('leaves an unrelated condition and a condition outside the group alone', () => {
    expect(addCondition([frightened(2)], { slug: 'hidden' }, DEFINITIONS)).toEqual([
      frightened(2),
      { slug: 'hidden' },
    ]);
  });
});

describe('setCondition -- the GM override', () => {
  it('lowers a value, which a merge would refuse', () => {
    expect(setCondition([frightened(3)], frightened(1), DEFINITIONS)).toEqual([
      frightened(1),
    ]);
  });

  it('removes a valued condition set to 0', () => {
    expect(
      setCondition([frightened(3), { slug: 'prone' }], frightened(0), DEFINITIONS),
    ).toEqual([{ slug: 'prone' }]);
  });

  it('still clamps to the maximum and still clears a mutually exclusive group', () => {
    expect(setCondition([], frightened(9), DEFINITIONS)).toEqual([frightened(4)]);
    expect(setCondition([{ slug: 'observed' }], { slug: 'hidden' }, DEFINITIONS)).toEqual(
      [{ slug: 'hidden' }],
    );
  });
});

describe('removeCondition', () => {
  it('removes the named condition and ignores one that is absent', () => {
    const current: AppliedCondition[] = [frightened(2), { slug: 'prone' }];
    expect(removeCondition(current, 'prone')).toEqual([frightened(2)]);
    expect(removeCondition(current, 'clumsy')).toEqual(current);
  });
});

describe('immutability', () => {
  it('never changes the list it was given', () => {
    const current: AppliedCondition[] = Object.freeze([
      Object.freeze(frightened(1)),
      Object.freeze({ slug: 'observed' }),
    ]) as unknown as AppliedCondition[];
    expect(() => {
      addCondition(current, frightened(3), DEFINITIONS);
      addCondition(current, { slug: 'hidden' }, DEFINITIONS);
      setCondition(current, frightened(0), DEFINITIONS);
      removeCondition(current, 'observed');
    }).not.toThrow();
    expect(current).toEqual([frightened(1), { slug: 'observed' }]);
  });
});

describe('durations', () => {
  const COMBATANT = '4b1e7c20-9d3a-4f6e-8c11-2a5d7e9f0b34';
  const threeRounds = { type: 'rounds', remaining: 3 } as const;
  const oneRound = { type: 'rounds', remaining: 1 } as const;
  const tenMinutes = { type: 'minutes', remaining: 10 } as const;
  const endOfTurn = { type: 'turn', combatantId: COMBATANT, boundary: 'end' } as const;
  const timed = (
    value: number,
    duration: AppliedCondition['duration'],
  ): AppliedCondition =>
    duration === undefined ? frightened(value) : { slug: 'frightened', value, duration };

  it('stores the duration a condition arrives with', () => {
    expect(addCondition([], timed(2, threeRounds), DEFINITIONS)).toEqual([
      timed(2, threeRounds),
    ]);
  });

  it('brings the duration of the higher value, whichever arrives first', () => {
    expect(addCondition([timed(1, tenMinutes)], timed(2, oneRound), DEFINITIONS)).toEqual(
      [timed(2, oneRound)],
    );
    expect(addCondition([timed(2, oneRound)], timed(1, tenMinutes), DEFINITIONS)).toEqual(
      [timed(2, oneRound)],
    );
  });

  it('keeps the longer-lasting duration when the values are equal', () => {
    expect(
      addCondition([timed(2, oneRound)], timed(2, threeRounds), DEFINITIONS),
    ).toEqual([timed(2, threeRounds)]);
    expect(
      addCondition([timed(2, tenMinutes)], timed(2, threeRounds), DEFINITIONS),
    ).toEqual([timed(2, tenMinutes)]);
  });

  it('makes a timed condition permanent when the same one arrives with no duration', () => {
    expect(addCondition([timed(2, threeRounds)], frightened(2), DEFINITIONS)).toEqual([
      frightened(2),
    ]);
  });

  it('is idempotent for a binary condition, and keeps a duration it already has', () => {
    const once = addCondition([], { slug: 'prone', duration: endOfTurn }, DEFINITIONS);
    expect(once).toEqual([{ slug: 'prone', duration: endOfTurn }]);
    expect(
      addCondition(once, { slug: 'prone', duration: endOfTurn }, DEFINITIONS),
    ).toEqual(once);
    expect(
      addCondition(
        once,
        { slug: 'prone', duration: { type: 'rounds', remaining: 1 } },
        DEFINITIONS,
      ),
    ).toEqual(once);
  });

  it('sets the duration exactly, including a shorter one, and clears it when none is given', () => {
    expect(setCondition([timed(2, tenMinutes)], timed(2, oneRound), DEFINITIONS)).toEqual(
      [timed(2, oneRound)],
    );
    expect(setCondition([timed(2, tenMinutes)], frightened(2), DEFINITIONS)).toEqual([
      frightened(2),
    ]);
  });

  it('removes a timed condition like any other', () => {
    expect(removeCondition([timed(2, oneRound)], 'frightened')).toEqual([]);
  });

  it('does not touch the duration of a condition it merely supersedes or leaves alone', () => {
    const current: AppliedCondition[] = [{ slug: 'prone', duration: endOfTurn }];
    expect(addCondition(current, frightened(1), DEFINITIONS)).toEqual([
      { slug: 'prone', duration: endOfTurn },
      frightened(1),
    ]);
  });
});
