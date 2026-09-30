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
    /** The level the encounter builder budgets against (milestone 12). */
    level: z.number().int().min(1).max(20).default(1),
  })
  .refine((party) => new Set(party.memberIds).size === party.memberIds.length, {
    message: 'a party cannot list the same member twice',
    path: ['memberIds'],
  });

export type Party = z.infer<typeof partySchema>;
