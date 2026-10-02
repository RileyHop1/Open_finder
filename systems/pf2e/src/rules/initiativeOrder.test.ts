import { describe, expect, it } from 'vitest';

import type { InitiativeEntry } from './initiativeOrder.js';
import {
  nextCombatant,
  previousCombatant,
  sortByInitiative,
  takesTurns,
} from './initiativeOrder.js';

let counter = 0;

/** An entry whose id says what it is; `joined` orders the tie-break by arrival. */
function entry(
  id: string,
  initiative: number | undefined,
  fields: Partial<Omit<InitiativeEntry, 'id' | 'initiative'>> = {},
): InitiativeEntry {
  counter += 1;
  return {
    id,
    initiative,
    defeated: false,
    isCharacter: false,
    createdAt: `2026-10-02T00:00:${String(counter).padStart(2, '0')}.000Z`,
    ...fields,
  };
}

const ids = (entries: readonly InitiativeEntry[]) => entries.map((e) => e.id);

describe('sortByInitiative', () => {
  it('puts the highest initiative first, negatives last of the rolled', () => {
    const order = sortByInitiative([
      entry('low', -1),
      entry('high', 21),
      entry('mid', 12),
    ]);
    expect(ids(order)).toEqual(['high', 'mid', 'low']);
  });

  it('puts a player character before a monster on a tie', () => {
    const order = sortByInitiative([
      entry('goblin', 15),
      entry('valeros', 15, { isCharacter: true }),
    ]);
    expect(ids(order)).toEqual(['valeros', 'goblin']);
  });

  it('puts the one who joined first first when everything else ties', () => {
    const first = entry('a-second-in-name', 10, {
      createdAt: '2026-10-02T00:00:01.000Z',
    });
    const second = entry('a-first-in-name', 10, {
      createdAt: '2026-10-02T00:00:02.000Z',
    });
    expect(ids(sortByInitiative([second, first]))).toEqual([
      'a-second-in-name',
      'a-first-in-name',
    ]);
  });

  it('falls back to the id, so the order never depends on how the list arrived', () => {
    const at = '2026-10-02T00:00:00.000Z';
    const a = entry('a', 10, { createdAt: at });
    const b = entry('b', 10, { createdAt: at });
    expect(ids(sortByInitiative([a, b]))).toEqual(['a', 'b']);
    expect(ids(sortByInitiative([b, a]))).toEqual(['a', 'b']);
  });

  it('sorts an unrolled combatant after every rolled one, even a negative roll', () => {
    const order = sortByInitiative([
      entry('unrolled', undefined, { isCharacter: true }),
      entry('rolled', -5),
    ]);
    expect(ids(order)).toEqual(['rolled', 'unrolled']);
  });

  it('applies the tie rule among the unrolled too', () => {
    const order = sortByInitiative([
      entry('goblin', undefined),
      entry('valeros', undefined, { isCharacter: true }),
    ]);
    expect(ids(order)).toEqual(['valeros', 'goblin']);
  });

  it('keeps a defeated combatant in place and does not change its input', () => {
    const input = [entry('dead', 18, { defeated: true }), entry('live', 20)];
    expect(ids(sortByInitiative(input))).toEqual(['live', 'dead']);
    expect(ids(input)).toEqual(['dead', 'live']);
  });
});

describe('takesTurns', () => {
  it('needs an initiative and to still be in the fight', () => {
    expect(takesTurns(entry('a', 10))).toBe(true);
    expect(takesTurns(entry('b', undefined))).toBe(false);
    expect(takesTurns(entry('c', 10, { defeated: true }))).toBe(false);
    expect(takesTurns(entry('zero', 0))).toBe(true);
  });
});

describe('nextCombatant', () => {
  const sorted = sortByInitiative([entry('a', 20), entry('b', 15), entry('c', 10)]);

  it('starts the combat at the top of the order, as a new round', () => {
    expect(nextCombatant(sorted, undefined)).toMatchObject({ wrapped: true });
    expect(nextCombatant(sorted, undefined).combatant?.id).toBe('a');
  });

  it('steps down the order within a round', () => {
    const step = nextCombatant(sorted, 'a');
    expect(step.combatant?.id).toBe('b');
    expect(step.wrapped).toBe(false);
  });

  it('wraps from the last to the first and starts a new round', () => {
    const step = nextCombatant(sorted, 'c');
    expect(step.combatant?.id).toBe('a');
    expect(step.wrapped).toBe(true);
  });

  it('skips the defeated and the unrolled', () => {
    const mixed = sortByInitiative([
      entry('a', 20),
      entry('dead', 15, { defeated: true }),
      entry('c', 10),
      entry('unrolled', undefined),
    ]);
    expect(nextCombatant(mixed, 'a').combatant?.id).toBe('c');
    expect(nextCombatant(mixed, 'c')).toMatchObject({ wrapped: true });
    expect(nextCombatant(mixed, 'c').combatant?.id).toBe('a');
  });

  it('steps on from a combatant who was just defeated', () => {
    const justFell = sortByInitiative([
      entry('a', 20),
      entry('b', 15, { defeated: true }),
      entry('c', 10),
    ]);
    expect(nextCombatant(justFell, 'b').combatant?.id).toBe('c');
  });

  it('gives the same combatant again, in a new round, when it is the only one left', () => {
    const alone = sortByInitiative([entry('a', 20), entry('b', 15, { defeated: true })]);
    expect(nextCombatant(alone, 'a')).toMatchObject({ wrapped: true });
    expect(nextCombatant(alone, 'a').combatant?.id).toBe('a');
  });

  it('gives nobody when nobody takes a turn', () => {
    const none = sortByInitiative([
      entry('a', undefined),
      entry('b', 5, { defeated: true }),
    ]);
    expect(nextCombatant(none, undefined).combatant).toBeUndefined();
    expect(nextCombatant(none, 'b').combatant).toBeUndefined();
    expect(nextCombatant([], undefined).combatant).toBeUndefined();
  });

  it('treats an id that is not in the order as the start', () => {
    expect(nextCombatant(sorted, 'gone').combatant?.id).toBe('a');
  });
});

describe('previousCombatant', () => {
  const sorted = sortByInitiative([entry('a', 20), entry('b', 15), entry('c', 10)]);

  it('steps back up the order within a round', () => {
    const step = previousCombatant(sorted, 'c');
    expect(step.combatant?.id).toBe('b');
    expect(step.wrapped).toBe(false);
  });

  it('wraps from the first back to the last, which is the previous round', () => {
    const step = previousCombatant(sorted, 'a');
    expect(step.combatant?.id).toBe('c');
    expect(step.wrapped).toBe(true);
  });

  it('skips the defeated', () => {
    const mixed = sortByInitiative([
      entry('a', 20),
      entry('dead', 15, { defeated: true }),
      entry('c', 10),
    ]);
    expect(previousCombatant(mixed, 'c').combatant?.id).toBe('a');
  });

  it('gives nobody from the start of the combat or an unknown id', () => {
    expect(previousCombatant(sorted, undefined).combatant).toBeUndefined();
    expect(previousCombatant(sorted, 'gone').combatant).toBeUndefined();
  });
});
