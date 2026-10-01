/**
 * The compendium, read side (ADR 0015): loads the packs the importer wrote
 * (ADR 0012, `<root>/<packId>/pack.json` plus one `<slug>.json` per entry)
 * into an in-memory index once at startup, and answers search and lookup from
 * it. Read-only: nothing here writes a pack, and nothing opens `node:sqlite`.
 *
 * **Degrades, never crashes.** A missing directory is an empty compendium
 * (`available: false`), so a fresh checkout that has not run the importer
 * still starts and the sheet still works for hand-entered values. A pack with
 * no manifest, a file that is not JSON, and an entry that fails
 * `pf2eEntrySchema` are each skipped and counted in `skipped`, not thrown.
 *
 * **No paths from requests.** Lookup is a `Map` keyed by `packId/slug`; a
 * request parameter is never joined into a filesystem path, so there is no
 * path-traversal surface to get wrong.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { PackManifest } from '@hearthtable/core';
import { packManifestSchema } from '@hearthtable/core';
import type { ConditionEntry, Pf2eEntry } from '@hearthtable/pf2e';
import { pf2eEntrySchema } from '@hearthtable/pf2e';

/** The lightweight view search returns: enough to list and pick, not the whole entry. */
export interface EntrySummary {
  readonly packId: string;
  readonly slug: string;
  readonly name: string;
  readonly kind: string;
  readonly traits: readonly string[];
}

export interface SearchOptions {
  /** Only entries of this `kind` (`weapon`, `feat`, ...). */
  readonly kind?: string | undefined;
  /** Case-insensitive; names starting with it rank before names merely containing it. */
  readonly q?: string | undefined;
  /** Default 50, at most 200. */
  readonly limit?: number | undefined;
}

export interface CompendiumStatus {
  /** Whether any entry was loaded. False before the importer has been run. */
  readonly available: boolean;
  readonly packs: readonly PackManifest[];
  readonly entryCount: number;
  /** Files that were present but could not be used. */
  readonly skipped: number;
}

export interface CompendiumIndex {
  status(): CompendiumStatus;
  search(options?: SearchOptions): EntrySummary[];
  get(packId: string, slug: string): Pf2eEntry | undefined;
  /** Every condition definition by slug, for the merge and clearing rules (`rules/conditionMerge.ts`). Empty before the importer has been run. */
  conditions(): ReadonlyMap<string, ConditionEntry>;
}

export const DEFAULT_SEARCH_LIMIT = 50;
export const MAX_SEARCH_LIMIT = 200;

interface IndexedEntry {
  readonly entry: Pf2eEntry;
  readonly summary: EntrySummary;
  readonly lowerName: string;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

function summarize(entry: Pf2eEntry): EntrySummary {
  return {
    packId: entry.packId,
    slug: entry.slug,
    name: entry.name,
    kind: entry.kind,
    traits: entry.traits,
  };
}

/** An index with nothing in it: what a server without imported data uses. */
export function emptyCompendium(): CompendiumIndex {
  return buildIndex([], [], 0);
}

function buildIndex(
  entries: readonly IndexedEntry[],
  packs: readonly PackManifest[],
  skipped: number,
): CompendiumIndex {
  const byKey = new Map(
    entries.map((item) => [`${item.entry.packId}/${item.entry.slug}`, item.entry]),
  );

  const conditionDefinitions = new Map<string, ConditionEntry>();
  for (const item of entries) {
    if (item.entry.kind === 'condition') {
      conditionDefinitions.set(item.entry.slug, item.entry);
    }
  }

  return {
    status: () => ({
      available: entries.length > 0,
      packs,
      entryCount: entries.length,
      skipped,
    }),

    search(options = {}) {
      const limit = Math.min(
        Math.max(1, Math.floor(options.limit ?? DEFAULT_SEARCH_LIMIT)),
        MAX_SEARCH_LIMIT,
      );
      const query = options.q?.trim().toLowerCase() ?? '';
      const prefix: IndexedEntry[] = [];
      const contains: IndexedEntry[] = [];
      for (const item of entries) {
        if (options.kind !== undefined && item.summary.kind !== options.kind) {
          continue;
        }
        if (query === '' || item.lowerName.startsWith(query)) {
          prefix.push(item);
        } else if (item.lowerName.includes(query)) {
          contains.push(item);
        }
      }
      const byName = (a: IndexedEntry, b: IndexedEntry) =>
        a.lowerName.localeCompare(b.lowerName) ||
        a.summary.slug.localeCompare(b.summary.slug);
      return [...prefix.sort(byName), ...contains.sort(byName)]
        .slice(0, limit)
        .map((item) => item.summary);
    },

    get: (packId, slug) => byKey.get(`${packId}/${slug}`),

    conditions: () => conditionDefinitions,
  };
}

/**
 * Reads every pack under `root`. Synchronous and eager, once: a server start
 * pays the cost so every later search is a memory scan. Returns an empty
 * compendium if `root` does not exist.
 */
export function loadCompendium(root: string): CompendiumIndex {
  if (!existsSync(root)) {
    return emptyCompendium();
  }

  const entries: IndexedEntry[] = [];
  const packs: PackManifest[] = [];
  let skipped = 0;

  for (const packDirName of readdirSync(root).sort()) {
    const packDir = join(root, packDirName);
    if (!statSync(packDir).isDirectory()) {
      continue;
    }
    const manifest = packManifestSchema.safeParse(readJson(join(packDir, 'pack.json')));
    if (!manifest.success) {
      skipped += 1;
      continue;
    }
    packs.push(manifest.data);

    for (const fileName of readdirSync(packDir).sort()) {
      if (fileName === 'pack.json' || !fileName.endsWith('.json')) {
        continue;
      }
      const parsed = pf2eEntrySchema.safeParse(readJson(join(packDir, fileName)));
      if (!parsed.success) {
        skipped += 1;
        continue;
      }
      entries.push({
        entry: parsed.data,
        summary: summarize(parsed.data),
        lowerName: parsed.data.name.toLowerCase(),
      });
    }
  }

  return buildIndex(entries, packs, skipped);
}
