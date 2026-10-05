/**
 * A trait's own glossary entry (ADR 0020 decision 5): a short, imported
 * description for a trait slug (`agile`, `finesse`, ...), separate from
 * `CompendiumEntry` because a trait has no publication to carry a
 * `Provenance` for -- unlike a condition, spell, or feat, it isn't an
 * upstream *entry* the license/scope filter ever sees, just a tag other
 * entries carry. The importer's trait glossary (`systems/pf2e`) is the only
 * writer; `apps/server`'s compendium route is the only reader besides tests.
 */

import { z } from 'zod';

import { richTextSchema } from './richText.js';

export const traitEntrySchema = z.object({
  slug: z.string().min(1),
  /** A display name derived from the slug (title case), not upstream's own trait name -- upstream doesn't carry one separately from its lang key. */
  name: z.string().min(1),
  text: richTextSchema,
});

export type TraitEntry = z.infer<typeof traitEntrySchema>;
