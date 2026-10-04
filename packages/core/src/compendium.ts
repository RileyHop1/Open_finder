/**
 * The compendium envelope: the shape every imported entry (feat, spell,
 * weapon, ancestry, class, creature, ...) shares, and the manifest that
 * describes one pack of them. See ADR 0012 for why a pack is a directory of
 * these files rather than a database, and `docs/compendium.md` for the spec.
 *
 * A `CompendiumEntry` extends `baseRecordSchema`, **not** `baseDocumentSchema`
 * -- the same reasoning `World` and `Seat` use (`docs/world-and-seats.md`).
 * A compendium entry has no `worldId`: it does not belong to any one world,
 * it is a read-only source a world imports *from* (CLAUDE.md's Architecture
 * section). It is likewise not permission-gated -- `resolvePermission`
 * resolves a seat against a document inside a world, which a compendium
 * entry is not.
 */

import { z } from 'zod';

import { provenanceSchema } from './provenance.js';
import { baseRecordSchema, timestampSchema } from './record.js';
import { richTextSchema } from './richText.js';
import { ruleElementSchema } from './ruleElement.js';

/**
 * One imported entry. `kind` stays an open, non-empty string here rather
 * than a pre-declared union of every content kind (`'feat' | 'spell' |
 * 'weapon' | ...`) -- the same reasoning `baseDocumentSchema.type` uses in
 * `document.ts`. `systems/pf2e`'s content schemas narrow it to a literal per
 * kind; this package does not know PF2e's content kinds any more than it
 * knows its book titles.
 */
export const compendiumEntrySchema = baseRecordSchema.extend({
  packId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  provenance: provenanceSchema,
  traits: z.array(z.string().min(1)).readonly().default([]),
  ruleElements: z.array(ruleElementSchema).readonly().default([]),
  description: z.string().default(''),
  /**
   * The same rules text as `description`, converted to `RichText` at import
   * time (ADR 0020) -- this is what the client actually renders; nothing
   * reads `description` once the tooltip/encyclopedia UI lands. Optional
   * rather than defaulted: an entry imported before that conversion existed
   * (or any of this project's own hand-built fixtures, which have no HTML to
   * convert) simply has no `text` at all, rather than a default empty array
   * that would look identical to "converted, and genuinely empty." A reader
   * treats a missing `text` the same way it already treats a missing rule
   * element or trait list -- as nothing to show, not as an error.
   */
  text: richTextSchema.optional(),
});

export type CompendiumEntry = z.infer<typeof compendiumEntrySchema>;

/**
 * The manifest written once per pack (`pack.json`, ADR 0012), recording
 * exactly what produced it: which upstream commit and content checksum
 * (ADR 0011), how many entries, and when. A pack consumer -- and CI's
 * `import-smoke` job (milestone 2) -- reads this before reading any entry.
 */
export const packManifestSchema = z.object({
  packId: z.string().min(1),
  name: z.string().min(1),
  upstream: z.object({
    repo: z.string().min(1),
    commit: z.string().min(1),
    packsChecksum: z.string().min(1),
  }),
  entryCount: z.number().int().nonnegative(),
  generatedAt: timestampSchema,
});

export type PackManifest = z.infer<typeof packManifestSchema>;
