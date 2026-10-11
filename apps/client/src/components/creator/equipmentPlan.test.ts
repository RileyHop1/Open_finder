import { describe, expect, it } from 'vitest';

import {
  STARTING_COPPER,
  addLine,
  changeAfter,
  changeCopper,
  formatCopper,
  lineCost,
  overBudgetBy,
  setQuantity,
  totalCost,
  unpriced,
  type EquipmentLine,
} from './equipmentPlan.js';

// Everything below is invented (ADR 0013).
const sword = {
  packId: 'equipment',
  slug: 'invented-sword',
  name: 'Invented Sword',
  priceInCopper: 100,
};
const rope = {
  packId: 'equipment',
  slug: 'invented-rope',
  name: 'Invented Rope',
  priceInCopper: 10,
};
const mystery = { packId: 'equipment', slug: 'mystery', name: 'Mystery' };

describe('the starting purse', () => {
  it('is 15 gp (confirm)', () => {
    expect(STARTING_COPPER).toBe(1500);
  });

  // Golden: worked by hand. One sword (1 gp) and two ropes (1 sp each) cost
  // 100 + 2 * 10 = 120 cp, leaving 1380 cp = 13 gp 8 sp.
  it('adds up a shopping list, and leaves the change worked out by hand', () => {
    const lines = addLine(addLine(addLine([], sword), rope), rope);
    expect(lines.map((l) => [l.slug, l.quantity])).toEqual([
      ['invented-sword', 1],
      ['invented-rope', 2],
    ]);
    expect(lineCost(lines[1] as EquipmentLine)).toBe(20);
    expect(totalCost(lines)).toBe(120);
    expect(changeCopper(lines)).toBe(1380);
    expect(changeAfter(lines)).toEqual({ pp: 0, gp: 13, sp: 8, cp: 0 });
    expect(overBudgetBy(lines)).toBe(0);
  });

  it('reports spending past the purse, and gives no negative change (ADR 0023)', () => {
    const lines = setQuantity(addLine([], sword), sword.packId, sword.slug, 16);
    expect(totalCost(lines)).toBe(1600);
    expect(overBudgetBy(lines)).toBe(100);
    expect(changeAfter(lines)).toEqual({ pp: 0, gp: 0, sp: 0, cp: 0 });
  });

  it('counts an item with no known price as free, and says which', () => {
    const lines = addLine(addLine([], sword), mystery);
    expect(totalCost(lines)).toBe(100);
    expect(unpriced(lines).map((l) => l.name)).toEqual(['Mystery']);
  });
});

describe('editing the list', () => {
  it('changes a quantity, removes a line at zero, and caps a stack', () => {
    const lines = addLine(addLine([], sword), rope);
    expect(
      setQuantity(lines, rope.packId, rope.slug, 3).find((l) => l.slug === rope.slug)
        ?.quantity,
    ).toBe(3);
    expect(setQuantity(lines, rope.packId, rope.slug, 0).map((l) => l.slug)).toEqual([
      sword.slug,
    ]);
    expect(setQuantity(lines, rope.packId, rope.slug, 500)[1]?.quantity).toBe(99);
  });
});

describe('formatCopper', () => {
  it('writes coins the way the sheet does', () => {
    expect(formatCopper(1500)).toBe('15 gp');
    expect(formatCopper(1234)).toBe('12 gp 3 sp 4 cp');
    expect(formatCopper(0)).toBe('0 cp');
  });
});
