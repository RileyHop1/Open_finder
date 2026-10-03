import type { AppliedCondition } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { describeDyingChain } from './dyingChain.js';

describe('describeDyingChain', () => {
  it('says nothing when none of the five apply', () => {
    expect(describeDyingChain([])).toBeUndefined();
    expect(describeDyingChain([{ slug: 'frightened', value: 1 }])).toBeUndefined();
  });

  it('joins unconscious, dying, wounded and doomed, omitting zero values', () => {
    const conditions: AppliedCondition[] = [
      { slug: 'unconscious' },
      { slug: 'dying', value: 2 },
      { slug: 'wounded', value: 1 },
      { slug: 'doomed', value: 1 },
      { slug: 'frightened', value: 1 },
    ];
    expect(describeDyingChain(conditions)).toBe(
      'Unconscious, dying 2, wounded 1, doomed 1',
    );
  });

  it('shows dying alone without wounded or doomed', () => {
    expect(describeDyingChain([{ slug: 'dying', value: 1 }])).toBe('dying 1');
  });

  it('shows "Dead" alone, regardless of any other dying-chain condition present', () => {
    expect(describeDyingChain([{ slug: 'dead' }, { slug: 'dying', value: 4 }])).toBe(
      'Dead',
    );
  });
});
