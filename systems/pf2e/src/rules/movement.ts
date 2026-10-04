/**
 * Movement spends actions: a Stride covers a creature's Speed, and each
 * separate move is its own Stride (or more, for one that outruns a single
 * Speed), per RAW (docs/rulings.md, "Movement spends actions per move, not
 * by a running total"). Pure math only -- the server (`apps/server`) is the
 * one that knows a move happened and writes the result back; see
 * `docs/combat.md`.
 */

import type { Actor } from '@hearthtable/core';

import { characterDataSchema } from '../content/character.js';
import { npcDataSchema } from '../content/npc.js';

/**
 * How many Strides one move of `distanceFeet` costs, at a Speed of
 * `speedFeet`: `ceil(distance / speed)`, with a minimum of 1 for any nonzero
 * distance (a Stride is spent even for a single foot) and 0 for no movement
 * at all. A Speed of 0 cannot Stride at all, so every foot of distance costs
 * its own Stride (an edge case; the GM's override path is the action tray).
 */
export function stridesFor(distanceFeet: number, speedFeet: number): number {
  if (distanceFeet <= 0) {
    return 0;
  }
  if (speedFeet <= 0) {
    return distanceFeet;
  }
  return Math.max(1, Math.ceil(distanceFeet / speedFeet));
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
