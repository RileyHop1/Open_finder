/**
 * The `action` content kind: standalone activities like Escape, Treat
 * Wounds, or Reactive Strike -- things you do rather than things you carry.
 * Distinct from `feat` even though some feats grant new actions: an
 * `ActionEntry` is the activity itself, importable and displayable on the
 * action bar independent of whatever feat or class feature granted access
 * to it.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import { actionCostSchema, traitSlugSchema } from './common.js';

export const actionEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('action'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  actionCost: actionCostSchema,
});

export type ActionEntry = z.infer<typeof actionEntrySchema>;
