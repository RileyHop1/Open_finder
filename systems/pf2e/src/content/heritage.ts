/**
 * The `heritage` content kind: a further choice within (or across) an
 * ancestry, taken at character creation alongside it.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import { traitSlugSchema } from './common.js';

export const heritageEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('heritage'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  /**
   * The ancestry this heritage belongs to, by slug in the `ancestries`
   * pack. Absent means a **versatile heritage**, usable with any ancestry --
   * a bare slug rather than a `{ packId, slug }` reference (compare
   * `GrantItemElement` in `@hearthtable/core`) because there is exactly one
   * ancestries pack to resolve against, unlike a rule element's grant
   * target, which could be in any pack.
   */
  ancestrySlug: z.string().min(1).optional(),
});

export type HeritageEntry = z.infer<typeof heritageEntrySchema>;
