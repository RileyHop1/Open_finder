import { describe, expect, it } from 'vitest';

import { grantedSpells } from './classSpells.js';

describe('grantedSpells', () => {
  it('gives a Bard its composition spells and focus pool, and its muse’s spell once chosen', () => {
    expect(grantedSpells('bard', {})).toEqual({
      focusPoints: 1,
      cantrips: ['courageous-anthem'],
      focusSpells: ['counter-performance'],
      ranked: [],
    });
    expect(grantedSpells('bard', { muse: 'maestro' }).ranked).toEqual(['soothe']);
  });

  it('adds nothing for a choice value it does not know', () => {
    expect(grantedSpells('bard', { muse: 'invented-muse' }).ranked).toEqual([]);
  });

  it('grants nothing to a class with no row, or no class', () => {
    const none = { focusPoints: 0, cantrips: [], focusSpells: [], ranked: [] };
    expect(grantedSpells('fighter', {})).toEqual(none);
    expect(grantedSpells(undefined, { muse: 'enigma' })).toEqual(none);
  });
});
