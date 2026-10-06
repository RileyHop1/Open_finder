import { describe, expect, it } from 'vitest';

import {
  costGlyph,
  defaultSlotName,
  slotForKey,
  slotKey,
  swapSlots,
  withSlot,
} from './hotbarModel.js';

describe('slot keys', () => {
  it('number the slots 1 to 9 and then 0', () => {
    expect(Array.from({ length: 10 }, (_, i) => slotKey(i)).join('')).toBe('1234567890');
  });

  it('map a pressed key back to its slot, and ignore anything else', () => {
    expect(slotForKey('1')).toBe(0);
    expect(slotForKey('9')).toBe(8);
    expect(slotForKey('0')).toBe(9);
    for (const key of ['a', 'Enter', '10', '', ' ']) {
      expect(slotForKey(key)).toBeUndefined();
    }
  });
});

describe('costGlyph', () => {
  it('reads as diamonds, a reaction arrow, or nothing for free', () => {
    expect(costGlyph(1)).toBe('◆');
    expect(costGlyph(3)).toBe('◆◆◆');
    expect(costGlyph('reaction')).toBe('↺');
    expect(costGlyph('free')).toBe('');
  });
});

describe('withSlot', () => {
  it('replaces one position without touching the rest or the original', () => {
    const original = [null, null, null];
    const action = { name: 'Stab', text: 'Stab', cost: 1 as const };
    const next = withSlot(original, 1, action);
    expect(next).toEqual([null, action, null]);
    expect(original).toEqual([null, null, null]);
    expect(withSlot(next, 1, null)).toEqual([null, null, null]);
  });
});

describe('defaultSlotName', () => {
  it('offers the text, else the dice, cut to 24 characters', () => {
    expect(defaultSlotName('  Sneak attack ', '1d6')).toBe('Sneak attack');
    expect(defaultSlotName('', ' 1d6 ')).toBe('1d6');
    expect(defaultSlotName('x'.repeat(40), '')).toHaveLength(24);
  });
});

describe('swapSlots', () => {
  it('moves an action to an empty key, or trades places with an occupied one, without mutating', () => {
    const a = { name: 'A', text: 'a', cost: 1 as const };
    const b = { name: 'B', text: 'b', cost: 2 as const };
    const original = [a, null, b];
    expect(swapSlots(original, 0, 1)).toEqual([null, a, b]);
    expect(swapSlots(original, 0, 2)).toEqual([b, null, a]);
    expect(swapSlots(original, 1, 1)).toEqual(original);
    expect(original).toEqual([a, null, b]);
  });
});
