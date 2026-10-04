import { describe, expect, it } from 'vitest';

import { BASIC_ACTIONS } from './basicActions.js';

describe('BASIC_ACTIONS', () => {
  it('has no duplicate slugs and a non-negative cost on every entry', () => {
    const slugs = BASIC_ACTIONS.map((action) => action.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(BASIC_ACTIONS.every((action) => action.cost >= 0)).toBe(true);
  });

  it('lists the seven universal basic actions', () => {
    expect(BASIC_ACTIONS.map((action) => action.name)).toEqual([
      'Stride',
      'Step',
      'Interact',
      'Delay',
      'Ready',
      'Take Cover',
      'Seek',
    ]);
  });

  it('gives Delay no action cost (a free action) and Ready two actions', () => {
    const costOf = (slug: string) =>
      BASIC_ACTIONS.find((action) => action.slug === slug)?.cost;
    expect(costOf('delay')).toBe(0);
    expect(costOf('ready')).toBe(2);
  });
});
