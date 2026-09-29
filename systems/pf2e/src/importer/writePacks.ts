/**
 * The writer (ADR 0012): the final importer stage. Every entry handed to
 * this module has already been through the license filter, the scope
 * filter, its per-kind mapper, and dependency resolution -- so it should
 * already be a valid `Pf2eEntry`. It's re-validated against
 * `pf2eEntrySchema` here anyway, one more time, not because upstream data
 * might still be bad (every earlier stage already fails closed on that),
 * but because a mismatch at this point means a bug in *this importer*, and
 * that should be a loud crash while writing, never a silently malformed
 * pack file sitting on disk afterward.
 *
 * Writes one JSON file per entry (`<packId>/<slug>.json`) plus one
 * `pack.json` manifest per pack (ADR 0011's pin, an entry count, and when
 * this run happened) -- flat files, not a database, per ADR 0012.
 *
 * **Pure with respect to time.** `generatedAt` is a caller-supplied
 * parameter, not `new Date().toISOString()` computed inside -- the same
 * convention every mapper's own `importedAt` parameter already follows.
 * Given the same entries, pin, and `generatedAt`, two runs produce
 * byte-identical output; nothing in here reaches for the wall clock itself.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pf2eEntry } from '../content/entry.js';
import { pf2eEntrySchema } from '../content/entry.js';

/**
 * Display names for the packs this importer actually produces (see the
 * `packId` literals across every `mapX.ts`). A `packId` this project hasn't
 * shipped a mapper for yet falls back to the raw id itself rather than
 * failing -- this table is cosmetic (the manifest's `name` field), not part
 * of the scope filter.
 */
const PACK_NAMES: Readonly<Record<string, string>> = {
  actions: 'Actions',
  ancestries: 'Ancestries',
  backgrounds: 'Backgrounds',
  classes: 'Classes',
  classFeatures: 'Class Features',
  conditions: 'Conditions',
  creatures: 'Creatures',
  equipment: 'Equipment',
  feats: 'Feats',
  heritages: 'Heritages',
  spells: 'Spells',
};

export interface UpstreamPin {
  readonly repo: string;
  readonly commit: string;
  readonly packsChecksum: string;
}

export interface WritePacksOptions {
  readonly entries: readonly Pf2eEntry[];
  readonly outputDir: string;
  readonly upstream: UpstreamPin;
  readonly generatedAt: string;
}

export interface WritePacksResult {
  readonly packs: readonly { readonly packId: string; readonly entryCount: number }[];
}

function packName(packId: string): string {
  return PACK_NAMES[packId] ?? packId;
}

export function writePacks(options: WritePacksOptions): WritePacksResult {
  const { entries, outputDir, upstream, generatedAt } = options;

  const entriesByPack = new Map<string, Pf2eEntry[]>();
  const seenSlugs = new Set<string>();

  for (const entry of entries) {
    const validated = pf2eEntrySchema.safeParse(entry);
    if (!validated.success) {
      throw new Error(
        `importer produced an entry that fails its own schema (packId=${entry.packId}, slug=${entry.slug}): ${validated.error.message}`,
      );
    }

    const key = `${entry.packId}/${entry.slug}`;
    if (seenSlugs.has(key)) {
      // A silent overwrite would drop an entry with no record of it ever
      // having existed -- exactly the kind of quiet data loss the rest of
      // this importer fails closed on instead.
      throw new Error(`duplicate slug within pack, would overwrite: ${key}`);
    }
    seenSlugs.add(key);

    const pack = entriesByPack.get(entry.packId) ?? [];
    pack.push(validated.data);
    entriesByPack.set(entry.packId, pack);
  }

  const packs: { readonly packId: string; readonly entryCount: number }[] = [];
  for (const [packId, packEntries] of entriesByPack) {
    const packDir = join(outputDir, packId);
    mkdirSync(packDir, { recursive: true });

    for (const entry of packEntries) {
      writeFileSync(
        join(packDir, `${entry.slug}.json`),
        `${JSON.stringify(entry, null, 2)}\n`,
      );
    }

    const manifest = {
      packId,
      name: packName(packId),
      upstream,
      entryCount: packEntries.length,
      generatedAt,
    };
    writeFileSync(join(packDir, 'pack.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    packs.push({ packId, entryCount: packEntries.length });
  }

  return { packs: packs.sort((a, b) => a.packId.localeCompare(b.packId)) };
}
