/**
 * An actor's saved situational modifiers and its hotbar of saved actions
 * (ADR 0023: the player makes the rulings and adds their own numbers). Both
 * belong to the actor, not the browser, so they follow a player to another
 * device. They are plain data the client reads and writes through
 * `actor.setQuickbar`; the server never applies a modifier on its own.
 */

import { z } from 'zod';

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
