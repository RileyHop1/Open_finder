import { describe, expect, it } from 'vitest';

import type { Modifier } from '@hearthtable/core';

import { conditionModifiers } from './conditionModifiers.js';
import { buildMaxHitPoints } from './hitPoints.js';

const base = { ancestryHp: 8, classHp: 10, conModifier: 2 };

describe('buildMaxHitPoints', () => {
  it('is ancestry HP plus (class HP + Constitution) per level', () => {
    // 8 + (10 + 2) * 1
    expect(buildMaxHitPoints({ ...base, level: 1 }).total).toBe(20);
    // 8 + (10 + 2) * 5
    expect(buildMaxHitPoints({ ...base, level: 5 }).total).toBe(68);
    // 8 + (10 + 2) * 20
    expect(buildMaxHitPoints({ ...base, level: 20 }).total).toBe(248);
  });

  it('breaks the total into ancestry, class, and Constitution lines', () => {
    const { modifiers } = buildMaxHitPoints({ ...base, level: 5 });
    expect(modifiers.map((m) => [m.slug, m.value])).toEqual([
      ['ancestry-hp', 8],
      ['class-hp', 50],
      ['con', 10],
    ]);
  });

  it('subtracts a negative Constitution modifier at every level', () => {
    // 6 + (8 - 1) * 3
    expect(
      buildMaxHitPoints({ ancestryHp: 6, classHp: 8, conModifier: -1, level: 3 }).total,
    ).toBe(27);
  });

  it('leaves out a zero line rather than showing a +0', () => {
    const { modifiers } = buildMaxHitPoints({ ...base, conModifier: 0, level: 2 });
    expect(modifiers.map((m) => m.slug)).toEqual(['ancestry-hp', 'class-hp']);
  });

  it('adds hp-selector modifiers from rule elements', () => {
    const toughness: Modifier = {
      slug: 'toughness',
      label: 'Invented Toughness',
      type: 'untyped',
      value: 5,
      source: 'Invented Toughness',
      enabled: true,
    };
    expect(
      buildMaxHitPoints({ ...base, level: 5, extraModifiers: [toughness] }).total,
    ).toBe(73);
  });

  it('lowers max HP by level times the drained value', () => {
    const drained = conditionModifiers([{ slug: 'drained', value: 2 }], {
      kind: 'maxHp',
      level: 5,
    });
    // 68 - (2 * 5)
    expect(buildMaxHitPoints({ ...base, level: 5, extraModifiers: drained }).total).toBe(
      58,
    );
  });

  it('does not let a disabled modifier count (the GM override path)', () => {
    const drained = conditionModifiers([{ slug: 'drained', value: 2 }], {
      kind: 'maxHp',
      level: 5,
    }).map((m) => ({ ...m, enabled: false }));
    expect(buildMaxHitPoints({ ...base, level: 5, extraModifiers: drained }).total).toBe(
      68,
    );
  });
});
