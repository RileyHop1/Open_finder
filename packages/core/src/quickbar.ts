/**
 * An actor's saved situational modifiers and its hotbar of saved actions
 * (ADR 0023: the player makes the rulings and adds their own numbers). Both
 * belong to the actor, not the browser, so they follow a player to another
 * device. They are plain data the client reads and writes through
 * `actor.setQuickbar`; the server never applies a modifier on its own.
 */

import { z } from 'zod';

import type { Statistic } from './modifier.js';

/** How many saved modifiers an actor may keep. */
export const MAX_SITUATIONAL_MODIFIERS = 10;

/** The hotbar's fixed size: keys 1 to 9, then 0. */
export const HOTBAR_SLOTS = 10;

/** One situational modifier ("Flanking +2"): a signed value, an optional label, and whether it counts right now. */
export const situationalModifierSchema = z.object({
  value: z.number().int().min(-50).max(50),
  label: z.string().trim().min(1).max(40).optional(),
  active: z.boolean(),
});

export type SituationalModifier = z.infer<typeof situationalModifierSchema>;

/** What a saved action costs: nothing, a reaction, or 1 to 3 actions. */
export const hotbarCostSchema = z.union([
  z.literal('free'),
  z.literal('reaction'),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

/** A saved action: a short name for the slot, what it does, its cost, and optional dice (`1d20+7`). */
export const hotbarActionSchema = z.object({
  name: z.string().trim().min(1).max(24),
  text: z.string().trim().max(120),
  cost: hotbarCostSchema,
  dice: z.string().trim().max(60).optional(),
});

export type HotbarAction = z.infer<typeof hotbarActionSchema>;

/** Ten positions, each a saved action or `null`. The position is the hotkey, so empty slots stay in place. */
export const hotbarSchema = z.array(hotbarActionSchema.nullable()).length(HOTBAR_SLOTS);

export const situationalModifiersSchema = z
  .array(situationalModifierSchema)
  .max(MAX_SITUATIONAL_MODIFIERS);

/** A hotbar with nothing saved. */
export function emptyHotbar(): null[] {
  return Array.from({ length: HOTBAR_SLOTS }, () => null);
}

/** What a roll carries of a situational modifier: its value and label. Whether it is switched on is the client's business, so only the ones that count are sent. */
export const rollModifiersSchema = z
  .array(situationalModifierSchema.pick({ value: true, label: true }))
  .max(MAX_SITUATIONAL_MODIFIERS);

export type RollModifier = z.infer<typeof rollModifiersSchema>[number];

/**
 * `statistic` with the player's situational modifiers added to it, each one an
 * untyped, applied entry sourced "Situational" so the roll's breakdown shows it
 * (ADR 0008). Untyped modifiers always stack, so adding them needs no
 * re-resolution. The server never decides a modifier applies: it adds exactly
 * the ones the roller sent (ADR 0023).
 */
export function withSituational(
  statistic: Statistic,
  modifiers: readonly RollModifier[] | undefined,
): Statistic {
  if (modifiers === undefined || modifiers.length === 0) {
    return statistic;
  }
  const added = modifiers.map((modifier, index) => ({
    slug: `situational-${String(index + 1)}`,
    label: modifier.label ?? 'Situational',
    type: 'untyped' as const,
    value: modifier.value,
    source: 'Situational',
    enabled: true,
    applied: true,
  }));
  return {
    total: statistic.total + added.reduce((sum, modifier) => sum + modifier.value, 0),
    modifiers: [...statistic.modifiers, ...added],
  };
}
