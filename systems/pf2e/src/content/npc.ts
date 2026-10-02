/**
 * `npcDataSchema`: the PF2e payload stored in an NPC `Actor`'s opaque `system`
 * field (ADR 0014, ADR 0017). Where a character stores the *inputs* its numbers
 * are built from, a creature's numbers are already finished (`creature.ts`), so
 * an NPC stores an **embedded copy of the creature entry** and only the two
 * things that change in play: current hit points and conditions.
 *
 * The copy follows ADR 0014's rule for items: a reviewed re-import of the
 * compendium must never silently change a monster the GM is mid-campaign with,
 * and a world must not depend on a git-ignored folder. The GM can edit the copy
 * (a tougher goblin is `system.creature.hp`), which is the override path.
 */

import { z } from 'zod';

import { appliedConditionSchema, itemSourceSchema } from './character.js';
import { creatureEntrySchema, type CreatureEntry } from './creature.js';
import { persistentDamageSchema } from './persistentDamage.js';

export const npcDataSchema = z
  .object({
    /** The creature as it was when this actor was made. `creature.hp` is the maximum. */
    creature: creatureEntrySchema,
    /** Where the copy came from (pack and slug), kept for display and a future deliberate refresh. Absent for a hand-made creature. */
    source: itemSourceSchema.optional(),
    hp: z.object({
      current: z.number().int().nonnegative(),
      temp: z.number().int().nonnegative().default(0),
    }),
    conditions: z.array(appliedConditionSchema).default([]),
    /** Persistent damage still burning; empty when none (`persistentDamage.ts`). */
    persistentDamage: z.array(persistentDamageSchema).default([]),
  })
  .refine(
    (data) =>
      new Set(data.conditions.map((condition) => condition.slug)).size ===
      data.conditions.length,
    {
      message: 'a condition can appear only once; a valued condition carries one value',
      path: ['conditions'],
    },
  );

export type NpcData = z.infer<typeof npcDataSchema>;

/**
 * A fresh NPC from a creature entry: full hit points, no temporary hit points,
 * no conditions. What `actor.createFromCreature` stores (the server builds it
 * from its own compendium; a client never supplies a creature).
 */
export function newNpcFromCreature(
  creature: CreatureEntry,
  source?: { packId: string; slug: string },
): NpcData {
  return npcDataSchema.parse({
    creature,
    ...(source === undefined ? {} : { source }),
    hp: { current: creature.hp },
  });
}
