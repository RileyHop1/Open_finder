/**
 * Movement spends actions: a Stride covers a creature's Speed, and moving
 * further costs another Stride for each additional Speed's worth of
 * distance. Pure math only -- the server (`apps/server`) is the one that
 * knows a move happened and writes the result back; see `docs/combat.md`.
 */

import type { Actor } from '@hearthtable/core';

import { characterDataSchema } from '../content/character.js';
import { npcDataSchema } from '../content/npc.js';

/**
 * How many additional Strides moving from `usedFeet` already spent this turn
 * to `usedFeet + addedFeet` costs, at a Speed of `speedFeet`. A Stride covers
 * up to one Speed's worth of distance, so the cost is how many Speeds the
 * new total needs beyond how many the old total already needed --
 * `ceil((used + added) / speed) - ceil(used / speed)` -- never negative, and
 * never charged twice for the same ground. A Speed of 0 cannot Stride at all,
 * so every foot of `addedFeet` costs its own Stride (an edge case; the GM's
 * override path is this operation's own undo).
 */
export function stridesFor(
  usedFeet: number,
  addedFeet: number,
  speedFeet: number,
): number {
  if (addedFeet <= 0) {
    return 0;
  }
  if (speedFeet <= 0) {
    return addedFeet;
  }
  const before = Math.ceil(usedFeet / speedFeet);
  const after = Math.ceil((usedFeet + addedFeet) / speedFeet);
  return after - before;
}

/**
 * `actor`'s land speed in feet: a character's hand-set `speed` field, or an
 * NPC's `creature.speeds.land`. `undefined` for anything else (a hazard, or
 * data that does not match its kind's schema) -- there is no rule for how
 * far a hazard moves, so the caller decides whether to track movement at
 * all rather than this function guessing a number.
 */
export function speedOf(actor: Actor): number | undefined {
  if (actor.kind === 'character') {
    const data = characterDataSchema.safeParse(actor.system);
    return data.success ? data.data.speed : undefined;
  }
  if (actor.kind === 'npc') {
    const data = npcDataSchema.safeParse(actor.system);
    return data.success ? data.data.creature.speeds.land : undefined;
  }
  return undefined;
}
