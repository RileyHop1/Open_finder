/**
 * The `feat` content kind: ancestry, class, general, skill, and archetype
 * feats. Extends `@hearthtable/core`'s `compendiumEntrySchema` the same way
 * a concrete document type extends `baseDocumentSchema` -- narrow `kind` to
 * a literal, add what makes this kind specific.
 *
 * `traits` is overridden from the envelope's generic `string[]` to
 * `traitSlugSchema` -- `packages/core` doesn't know what a PF2e trait slug
 * looks like, but this package does, so the stronger validation belongs
 * here rather than loosened at the envelope for every content kind that
 * doesn't need it.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import { actionCostSchema, traitSlugSchema } from './common.js';

/**
 * Where a feat comes from in the character-building flow. **(confirm)**
 * against real upstream data during the importer PR (C.7a) -- this is our
 * own categorization, informed by how Player Core presents feats, not a
 * verified transcription of upstream's own category field values.
 */
export const FEAT_CATEGORIES = [
  'ancestry',
  'class',
  'general',
  'skill',
  'archetype',
] as const;

export type FeatCategory = (typeof FEAT_CATEGORIES)[number];

export const featCategorySchema = z.enum(FEAT_CATEGORIES);

export const featEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('feat'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  level: z.number().int().min(1),
  category: featCategorySchema,
  /**
   * Absent for the common case: a feat with no action cost of its own
   * (most feats are passive, or modify an existing action rather than
   * being one). Present when the feat itself is taken as an action, e.g. a
   * skill feat that grants a new activity.
   */
  actionCost: actionCostSchema.optional(),
  /**
   * Free-text prerequisite descriptions ("trained in Athletics", "level
   * 5"), not a structured, machine-checked graph. A real prerequisite
   * graph -- parsed, validated, and driving what the creation wizard shows
   * as available -- is milestone 7's job; v1's importer only needs to
   * carry the text through so the sheet and wizard can display it.
   */
  prerequisites: z.array(z.string().min(1)).readonly().default([]),
});

export type FeatEntry = z.infer<typeof featEntrySchema>;
