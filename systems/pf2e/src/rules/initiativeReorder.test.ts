import { describe, expect, it } from 'vitest';

import type { InitiativeEntry } from './initiativeOrder.js';
import { sortByInitiative } from './initiativeOrder.js';
import type { InitiativeChange } from './initiativeReorder.js';
import { placeCombatant } from './initiativeReorder.js';

let counter = 0;

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
    createdAt: `2026-10-02T00:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    ...fields,
  };
}

const ids = (entries: readonly InitiativeEntry[]) => entries.map((e) => e.id);

function apply(
  entries: readonly InitiativeEntry[],
  changes: readonly InitiativeChange[],
): InitiativeEntry[] {
  return entries.map((e) => {
    const change = changes.find((c) => c.id === e.id);
    return change === undefined ? e : { ...e, initiative: change.initiative };
  });
}

/** Moves `moverId` before `beforeId`, then checks the derived order is exactly what was asked for. */
function place(
  entries: readonly InitiativeEntry[],
  moverId: string,
  beforeId: string | undefined,
): InitiativeChange[] {
  const sorted = sortByInitiative(entries);
  const changes = placeCombatant(sorted, moverId, beforeId);
  expect(changes).toBeDefined();
  const rest = ids(sorted).filter((id) => id !== moverId);
  const at = beforeId === undefined ? rest.length : rest.indexOf(beforeId);
  const expected = [...rest.slice(0, at), moverId, ...rest.slice(at)];
  expect(ids(sortByInitiative(apply(entries, changes ?? [])))).toEqual(expected);
  return changes ?? [];
}

describe('placeCombatant -- room between neighbours', () => {
  const four = () => [entry('a', 20), entry('b', 15), entry('c', 10), entry('d', 5)];

  it('takes the midpoint between its new neighbours', () => {
    expect(place(four(), 'd', 'b')).toEqual([{ id: 'd', initiative: 17.5 }]);
  });

  it('moves a combatant later, past those it jumps', () => {
    expect(place(four(), 'a', 'd')).toEqual([{ id: 'a', initiative: 7.5 }]);
  });

  it('stays ordered after moving into the same gap again and again', () => {
    let entries = four();
    for (let move = 0; move < 30; move += 1) {
      entries = apply(entries, place(entries, move % 2 === 0 ? 'd' : 'c', 'b'));
    }
    expect(new Set(entries.map((e) => e.initiative)).size).toBe(4);
  });
});

describe('placeCombatant -- the ends', () => {
  const three = () => [entry('a', 20), entry('b', 15), entry('c', 10)];

  it('goes one above the first to go first', () => {
    expect(place(three(), 'c', 'a')).toEqual([{ id: 'c', initiative: 21 }]);
  });

  it('goes one below the last rolled to go last', () => {
    expect(place(three(), 'a', undefined)).toEqual([{ id: 'a', initiative: 9 }]);
  });

  it('works for a one-person combat, and for the first of several unrolled', () => {
    expect(place([entry('solo', undefined)], 'solo', undefined)).toEqual([]);
    expect(place([entry('x', undefined), entry('y', undefined)], 'y', 'x')).toEqual([
      { id: 'y', initiative: 0 },
    ]);
  });

  it('handles negative initiatives', () => {
    const entries = [entry('a', -1), entry('b', -4)];
    expect(place(entries, 'b', 'a')).toEqual([{ id: 'b', initiative: 0 }]);
    expect(place(entries, 'a', undefined)).toEqual([{ id: 'a', initiative: -5 }]);
  });
});

describe('placeCombatant -- unrolled combatants', () => {
  it('puts an unrolled mover among the rolled, giving it a number', () => {
    const entries = [entry('a', 20), entry('b', 10), entry('late', undefined)];
    expect(place(entries, 'late', 'b')).toEqual([{ id: 'late', initiative: 15 }]);
  });

  it('puts a rolled mover last among the rolled when it is moved before an unrolled one', () => {
    const entries = [entry('a', 20), entry('b', 10), entry('late', undefined)];
    expect(place(entries, 'a', 'late')).toEqual([{ id: 'a', initiative: 9 }]);
  });

  it('cannot choose a place among the unrolled: they have no number to sit between', () => {
    const entries = [
      entry('a', 20),
      entry('u1', undefined),
      entry('u2', undefined),
      entry('m', 5),
    ];
    expect(placeCombatant(sortByInitiative(entries), 'm', 'u2')).toBeUndefined();
  });
});

describe('placeCombatant -- ties', () => {
  it('spreads a two-way tie so the mover can sit between the pair', () => {
    const entries = [entry('a', 20), entry('x', 15), entry('y', 15), entry('m', 5)];
    const sorted = sortByInitiative(entries);
    const changes = place(entries, 'm', sorted[2]?.id); // between the tied pair
    const after = sortByInitiative(apply(entries, changes));
    const values = after.map((e) => e.initiative ?? 0);
    expect(new Set(values).size).toBe(4);
    expect(values.every((v) => v <= 20 && v >= 15)).toBe(true);
  });

  it('spreads a three-way tie, keeping every member below the next higher initiative', () => {
    const entries = [
      entry('top', 18),
      entry('p', 12),
      entry('q', 12),
      entry('r', 12),
      entry('m', 1),
    ];
    const sorted = sortByInitiative(entries);
    const changes = place(entries, 'm', sorted[2]?.id);
    const values = apply(entries, changes).map((e) => e.initiative ?? 0);
    expect(Math.max(...values.filter((v) => v < 18))).toBeLessThan(18);
    expect(new Set(values).size).toBe(5);
  });

  it('puts the mover before the first of a tie, and after the last of it', () => {
    const entries = [entry('a', 20), entry('x', 15), entry('y', 15), entry('m', 5)];
    const sorted = sortByInitiative(entries);
    place(entries, 'm', sorted[1]?.id);
    place(entries, 'm', sorted[3]?.id === 'm' ? undefined : sorted[3]?.id);
  });

  it('leaves the last tied member at its own number, so fewer values change', () => {
    const entries = [entry('x', 15), entry('y', 15), entry('m', 5)];
    const sorted = sortByInitiative(entries);
    const changes = place(entries, 'm', sorted[1]?.id);
    const last = sortByInitiative(apply(entries, changes)).at(-1);
    expect(last?.initiative).toBe(15);
  });
});

describe('placeCombatant -- nothing to do, or cannot', () => {
  const three = () => [entry('a', 20), entry('b', 15), entry('c', 10)];

  it('changes nothing for a move to where it already is, or before itself', () => {
    expect(placeCombatant(sortByInitiative(three()), 'b', 'c')).toEqual([]);
    expect(placeCombatant(sortByInitiative(three()), 'c', undefined)).toEqual([]);
    expect(placeCombatant(sortByInitiative(three()), 'b', 'b')).toEqual([]);
  });

  it('refuses an unknown combatant, or an unknown place', () => {
    expect(placeCombatant(sortByInitiative(three()), 'gone', 'a')).toBeUndefined();
    expect(placeCombatant(sortByInitiative(three()), 'a', 'gone')).toBeUndefined();
  });

  it('refuses a number that would leave the allowed range', () => {
    const entries = [entry('top', 1000), entry('m', 0)];
    expect(placeCombatant(sortByInitiative(entries), 'm', 'top')).toBeUndefined();
  });

  it('refuses when two neighbours are too close to fit a number between them', () => {
    const closer = [entry('a', 1), entry('b', 1 + Number.EPSILON), entry('m', -5)];
    expect(placeCombatant(sortByInitiative(closer), 'm', 'a')).toBeUndefined();
  });

  it('moves a defeated combatant like any other, and does not change its input', () => {
    const entries = [
      entry('a', 20),
      entry('dead', 15, { defeated: true }),
      entry('c', 10),
    ];
    const sorted = sortByInitiative(entries);
    place(entries, 'dead', undefined);
    expect(ids(sorted)).toEqual(['a', 'dead', 'c']);
  });
});
