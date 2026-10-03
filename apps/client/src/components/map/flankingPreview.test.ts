import { sceneGridSchema } from '@hearthtable/core';
import { SquareGrid } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { type FlankingToken, wouldFlank } from './flankingPreview.js';

/** 100px cells, 5ft each: adjacent squares are 100px apart. */
const grid = new SquareGrid(sceneGridSchema.parse({}));

const sideOf = (actorId: string): 'party' | 'other' =>
  actorId === 'goblin' ? 'other' : 'party';

const target: FlankingToken = {
  id: 'target',
  actorId: 'goblin',
  x: 250,
  y: 250,
  size: 1,
};
const attacker: FlankingToken = {
  id: 'attacker',
  actorId: 'hero',
  x: 150,
  y: 250,
  size: 1,
};
const allyOpposite: FlankingToken = {
  id: 'ally',
  actorId: 'cleric',
  x: 350,
  y: 250,
  size: 1,
};
const allySameSide: FlankingToken = {
  id: 'ally2',
  actorId: 'cleric',
  x: 150,
  y: 150,
  size: 1,
};

describe('wouldFlank', () => {
  it('flanks when the attacker and an ally threaten the target from opposite sides', () => {
    expect(
      wouldFlank(grid, sideOf, 'hero', target, [target, attacker, allyOpposite]),
    ).toBe(true);
  });

  it('does not flank when the only other ally is on the same side', () => {
    expect(
      wouldFlank(grid, sideOf, 'hero', target, [target, attacker, allySameSide]),
    ).toBe(false);
  });

  it('does not flank with no other token of the attacker’s side present', () => {
    expect(wouldFlank(grid, sideOf, 'hero', target, [target, attacker])).toBe(false);
  });

  it('never flanks a target on the attacker’s own side', () => {
    const sameSideTarget: FlankingToken = { ...target, actorId: 'hero' };
    expect(
      wouldFlank(grid, sideOf, 'hero', sameSideTarget, [
        sameSideTarget,
        attacker,
        allyOpposite,
      ]),
    ).toBe(false);
  });

  it('does not count the target itself as one of its own flankers', () => {
    // Only the target's own token is on the scene besides the attacker: no ally to flank with.
    expect(wouldFlank(grid, sideOf, 'hero', target, [target, attacker])).toBe(false);
  });
});
