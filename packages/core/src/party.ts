/**
 * Party: the adventuring group -- see CLAUDE.md's Architecture section. It is
 * a document rather than a flag on each actor because the party bar, the
 * overworld marker, and shared travel all need one owner for "who is in the
 * group and in what order."
 */

import { z } from 'zod';

import { baseDocumentSchema } from './document.js';
import { idSchema } from './record.js';

export const partySchema = baseDocumentSchema
  .extend({
    type: z.literal('party'),
    name: z.string().min(1),
    /** Actor ids in display order -- the order the party bar shows them in. */
    memberIds: z.array(idSchema),
    /** The level the encounter builder budgets against (milestone 13). */
    level: z.number().int().min(1).max(20).default(1),
    /**
     * The scene the party is in right now: the one every player's view
     * follows, and the one whose tokens they may see (ADR 0017). Absent means
     * the GM has not placed the party anywhere yet. Whether it names a scene
     * that exists is the server's check, not the schema's.
     */
    sceneId: idSchema.optional(),
    /**
     * The game system's own shared-inventory data -- opaque to core, the
     * same way an `Actor`'s `system` field is (ADR 0014), because what a
     * stash holds (item shapes, a purse) is system-specific. `systems/pf2e`
     * validates it (`partyStashSchema`); the server re-validates after
     * every mutation. Optional, not defaulted: a `.default({})` here would
     * make the field required in every place that builds a `Party` object
     * literal (TypeScript's inferred type for a Zod default is the output
     * type, not the input type -- see `common.ts`'s `bulkSchema` for the
     * same reasoning). Absent means the same thing `{}` does to
     * `partyStashSchema`: an empty stash.
     */
    stash: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((party) => new Set(party.memberIds).size === party.memberIds.length, {
    message: 'a party cannot list the same member twice',
    path: ['memberIds'],
  });

export type Party = z.infer<typeof partySchema>;
