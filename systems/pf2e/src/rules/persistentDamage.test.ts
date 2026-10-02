import { describe, expect, it } from 'vitest';

import type { PersistentDamage } from '../content/persistentDamage.js';
import {
  addPersistentDamage,
  ASSISTED_FLAT_CHECK_DC,
  endsPersistentDamage,
  FLAT_CHECK_DC,
  flatCheckDc,
  persistentDamageDue,
  resolvePersistentDamage,
} from './persistentDamage.js';

let counter = 0;
function burn(formula: string, damageType: string, source?: string): PersistentDamage {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  return source === undefined
    ? { id, formula, damageType }
    : { id, formula, damageType, source };
}

describe('the flat check', () => {
  it('is DC 15, or DC 10 with help', () => {
    expect(FLAT_CHECK_DC).toBe(15);
    expect(ASSISTED_FLAT_CHECK_DC).toBe(10);
    expect(flatCheckDc({ assisted: false })).toBe(15);
    expect(flatCheckDc({ assisted: true })).toBe(10);
  });

  it('succeeds on a natural roll at the DC or above, and not below', () => {
    expect(endsPersistentDamage({ natural: 14, assisted: false })).toBe(false);
    expect(endsPersistentDamage({ natural: 15, assisted: false })).toBe(true);
    expect(endsPersistentDamage({ natural: 20, assisted: false })).toBe(true);
    expect(endsPersistentDamage({ natural: 9, assisted: true })).toBe(false);
    expect(endsPersistentDamage({ natural: 10, assisted: true })).toBe(true);
  });

  it('does not treat a natural 20 or a natural 1 as special: it is a plain comparison', () => {
    expect(endsPersistentDamage({ natural: 1, assisted: false })).toBe(false);
    expect(endsPersistentDamage({ natural: 1, assisted: true })).toBe(false);
    expect(endsPersistentDamage({ natural: 20, assisted: true })).toBe(true);
  });
});

describe('addPersistentDamage', () => {
  it('stacks different damage types', () => {
    const fire = burn('1d6', 'fire');
    const bleed = burn('1d4', 'bleed');
    expect(addPersistentDamage([fire], bleed)).toEqual([fire, bleed]);
  });

  it('keeps the higher average for one type, whichever arrives first, in place', () => {
    const weak = burn('1d6', 'fire');
    const strong = burn('2d6', 'fire');
    const other = burn('1d4', 'bleed');
    expect(addPersistentDamage([weak, other], strong)).toEqual([strong, other]);
    expect(addPersistentDamage([strong, other], weak)).toEqual([strong, other]);
  });

  it('compares by average, not by the formula text', () => {
    const flat = burn('4', 'fire');
    const dice = burn('1d6', 'fire'); // 3.5
    expect(addPersistentDamage([dice], flat)).toEqual([flat]);
    expect(addPersistentDamage([flat], dice)).toEqual([flat]);
  });

  it('keeps the existing one on a tie', () => {
    const first = burn('1d6+1', 'fire', 'Torch');
    const second = burn('1d8', 'fire', 'Spark'); // 4.5 each
    expect(addPersistentDamage([first], second)).toEqual([first]);
  });

  it('does not change its input', () => {
    const list = [burn('1d6', 'fire')];
    addPersistentDamage(list, burn('3d6', 'fire'));
    expect(list).toHaveLength(1);
    expect(list[0]?.formula).toBe('1d6');
  });
});

describe('persistentDamageDue', () => {
  it('returns every entry in the list’s order, as a copy', () => {
    const list = [burn('1d6', 'fire'), burn('1d4', 'bleed')];
    const due = persistentDamageDue(list);
    expect(due).toEqual(list);
    expect(due).not.toBe(list);
    expect(persistentDamageDue([])).toEqual([]);
  });
});

describe('resolvePersistentDamage', () => {
  const fire = burn('1d6', 'fire');
  const bleed = burn('1d4', 'bleed');

  it('ends an entry whose flat check succeeds, and says so', () => {
    const { remaining, events } = resolvePersistentDamage(
      [fire],
      [{ id: fire.id, damage: 4, natural: 17 }],
    );
    expect(remaining).toEqual([]);
    expect(events).toEqual([
      { kind: 'damaged', id: fire.id, damageType: 'fire', damage: 4 },
      { kind: 'ended', id: fire.id, damageType: 'fire', natural: 17, dc: 15 },
    ]);
  });

  it('keeps an entry whose flat check fails', () => {
    const { remaining, events } = resolvePersistentDamage(
      [fire],
      [{ id: fire.id, damage: 3, natural: 6 }],
    );
    expect(remaining).toEqual([fire]);
    expect(events[1]).toEqual({
      kind: 'stillBurning',
      id: fire.id,
      damageType: 'fire',
      natural: 6,
      dc: 15,
    });
  });

  it('settles two at once independently, in the list’s order', () => {
    const { remaining, events } = resolvePersistentDamage(
      [fire, bleed],
      [
        { id: bleed.id, damage: 2, natural: 3 },
        { id: fire.id, damage: 5, natural: 16 },
      ],
    );
    expect(remaining).toEqual([bleed]);
    expect(events.map((e) => `${e.kind}:${e.damageType}`)).toEqual([
      'damaged:fire',
      'ended:fire',
      'damaged:bleed',
      'stillBurning:bleed',
    ]);
  });

  it('uses DC 10 when the flat check was assisted', () => {
    const { remaining, events } = resolvePersistentDamage(
      [fire],
      [{ id: fire.id, damage: 3, natural: 11, assisted: true }],
    );
    expect(remaining).toEqual([]);
    expect(events[1]).toMatchObject({ kind: 'ended', dc: 10 });
  });

  it('leaves an entry with no result alone, with no event', () => {
    const { remaining, events } = resolvePersistentDamage(
      [fire, bleed],
      [{ id: fire.id, damage: 3, natural: 2 }],
    );
    expect(remaining).toEqual([fire, bleed]);
    expect(events.every((e) => e.id === fire.id)).toBe(true);
  });

  it('ignores a result for an entry that is not there, and does not change its input', () => {
    const list = [fire];
    const { remaining } = resolvePersistentDamage(list, [
      { id: 'gone', damage: 9, natural: 20 },
    ]);
    expect(remaining).toEqual([fire]);
    expect(list).toEqual([fire]);
  });
});
