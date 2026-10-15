import type { CharacterItem, SpellcastingEntry } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import {
  addCantrip,
  forgetSpell,
  learnSpell,
  prepareSpell,
  removeCantrip,
  setSlotMax,
  slotMax,
  spellOptions,
  unprepareSpell,
} from './spellEdits.js';

const base = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Invented spellcasting',
  tradition: 'arcane' as const,
  attribute: 'int' as const,
  rank: 'trained' as const,
  cantrips: [] as string[],
};

const prepared: SpellcastingEntry = {
  ...base,
  kind: 'prepared',
  slots: { '1': 2 },
  prepared: [{ rank: 1, itemId: 'a', expended: true }],
};

const spontaneous: SpellcastingEntry = {
  ...base,
  kind: 'spontaneous',
  slots: { '1': { max: 3, used: 2 } },
  repertoire: ['a'],
  signature: ['a'],
};

describe('spell list edits', () => {
  it('prepares another copy, even past the slots and above the slot rank (ADR 0023)', () => {
    const once = prepareSpell(prepared, 'b', 1);
    const twice = prepareSpell(prepareSpell(once, 'b', 1), 'c', 3);
    expect(twice.kind === 'prepared' ? twice.prepared : []).toEqual([
      { rank: 1, itemId: 'a', expended: true },
      { rank: 1, itemId: 'b', expended: false },
      { rank: 1, itemId: 'b', expended: false },
      { rank: 3, itemId: 'c', expended: false },
    ]);
  });

  it('unprepares one row by its place, leaving other copies of the same spell', () => {
    const two = prepareSpell(prepared, 'a', 1);
    const one = unprepareSpell(two, 0);
    expect(one.kind === 'prepared' ? one.prepared : []).toEqual([
      { rank: 1, itemId: 'a', expended: false },
    ]);
  });

  it('learns a spell once, and forgetting it also drops it as a signature spell', () => {
    expect(learnSpell(spontaneous, 'a')).toBe(spontaneous);
    const learned = learnSpell(spontaneous, 'b');
    expect(learned.kind === 'spontaneous' ? learned.repertoire : []).toEqual(['a', 'b']);
    const forgot = forgetSpell(learned, 'a');
    expect(
      forgot.kind === 'spontaneous' ? [forgot.repertoire, forgot.signature] : [],
    ).toEqual([['b'], []]);
  });

  it('leaves the other kind of entry alone', () => {
    expect(prepareSpell(spontaneous, 'b', 1)).toBe(spontaneous);
    expect(unprepareSpell(spontaneous, 0)).toBe(spontaneous);
    expect(learnSpell(prepared, 'b')).toBe(prepared);
    expect(forgetSpell(prepared, 'a')).toBe(prepared);
  });

  it('adds a cantrip once and removes it', () => {
    const added = addCantrip(addCantrip(prepared, 'z'), 'z');
    expect(added.cantrips).toEqual(['z']);
    expect(removeCantrip(added, 'z').cantrips).toEqual([]);
  });

  it('sets a prepared rank’s slots by hand, and none removes the rank', () => {
    const three = setSlotMax(prepared, 2, 3);
    expect(three.slots).toEqual({ '1': 2, '2': 3 });
    expect(setSlotMax(three, 1, 0).slots).toEqual({ '2': 3 });
    expect(slotMax(three, 2)).toBe(3);
    expect(slotMax(three, 5)).toBe(0);
  });

  it('keeps what a spontaneous rank has used when its maximum changes', () => {
    expect(setSlotMax(spontaneous, 1, 1).slots).toEqual({ '1': { max: 1, used: 2 } });
    // A rank with nothing used goes away at none; one with slots used stays to show "-2".
    expect(setSlotMax(spontaneous, 1, 0).slots).toEqual({ '1': { max: 0, used: 2 } });
    expect(setSlotMax(setSlotMax(spontaneous, 2, 2), 2, 0).slots).not.toHaveProperty('2');
    expect(slotMax(spontaneous, 1)).toBe(3);
  });

  it('lists the character’s spells by rank then name, marking cantrips', () => {
    const item = (id: string, name: string, rank: number, traits: string[] = []) =>
      ({ id, entry: { kind: 'spell', name, rank, traits } }) as unknown as CharacterItem;
    const gear = {
      id: 'g',
      entry: { kind: 'gear', name: 'Rope' },
    } as unknown as CharacterItem;
    expect(
      spellOptions([
        item('2', 'Bolt', 2),
        gear,
        item('1', 'Zap', 1, ['cantrip']),
        item('3', 'Arc', 2),
      ]),
    ).toEqual([
      { itemId: '1', name: 'Zap', rank: 1, cantrip: true },
      { itemId: '3', name: 'Arc', rank: 2, cantrip: false },
      { itemId: '2', name: 'Bolt', rank: 2, cantrip: false },
    ]);
  });
});
