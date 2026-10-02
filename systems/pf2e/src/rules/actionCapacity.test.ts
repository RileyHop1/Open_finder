import { describe, expect, it } from 'vitest';

import type { AppliedCondition } from '../content/character.js';
import { actionCapacity, BASE_ACTIONS } from './actionCapacity.js';

const slowed = (value: number): AppliedCondition => ({ slug: 'slowed', value });

describe('actionCapacity', () => {
  it('is three actions with no conditions', () => {
    expect(BASE_ACTIONS).toBe(3);
    expect(actionCapacity([])).toEqual({ total: 3, quickenedExtra: false });
  });

  it('adds quickened’s extra action and says it is restricted', () => {
    expect(actionCapacity([{ slug: 'quickened' }])).toEqual({
      total: 4,
      quickenedExtra: true,
    });
  });

  it('removes one action per point of slowed', () => {
    expect(actionCapacity([slowed(1)]).total).toBe(2);
    expect(actionCapacity([slowed(2)]).total).toBe(1);
    expect(actionCapacity([slowed(3)]).total).toBe(0);
  });

  it('never goes below zero', () => {
    expect(actionCapacity([slowed(5)])).toEqual({ total: 0, quickenedExtra: false });
  });

  it('nets quickened against slowed', () => {
    expect(actionCapacity([{ slug: 'quickened' }, slowed(1)])).toEqual({
      total: 3,
      quickenedExtra: true,
    });
    expect(actionCapacity([{ slug: 'quickened' }, slowed(4)])).toEqual({
      total: 0,
      quickenedExtra: false,
    });
  });

  it('ignores every other condition, stunned included (it acts at the start of the turn)', () => {
    expect(
      actionCapacity([
        { slug: 'stunned', value: 2 },
        { slug: 'frightened', value: 2 },
        { slug: 'prone' },
      ]),
    ).toEqual({ total: 3, quickenedExtra: false });
  });
});
