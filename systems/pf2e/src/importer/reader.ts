/**
 * Reads every upstream JSON file under a fetched `packs/` directory into a
 * loose `UpstreamEntry` -- `_id`, `name`, `type`, and an untyped `system`
 * blob. This is the only shape every later importer stage sees; nothing
 * here validates against our own schemas (that starts at the license
 * filter) or interprets Foundry's document types (that stays confined to
 * the mapping stages, per ADR 0004 decision 3 -- this module only reads
 * JSON, it does not know what any of it means).
 *
 * **Malformed JSON is an error, not a skip.** A file that fails to parse
 * means something is wrong with the fetch or the pin, not a document to
 * quietly ignore -- ADR 0003's whole premise is that every entry's
 * provenance is accounted for.
 *
 * **A well-formed file that isn't an entry at all is skipped**, since it
 * was never content to begin with. Upstream's `_folders.json` files are the
 * real example: each one is a JSON *array* of folder metadata, not a single
 * object shaped like an entry, and Foundry folder objects can carry their
 * own `type` field (the *content* type the folder organizes) -- so the
 * array-vs-object check matters, not just presence of `type`.
 */

import { readFileSync } from 'node:fs';

import { listFilesRecursively, toPosixRelativePath } from './listFiles.js';

export interface UpstreamEntry {
  /** Relative to the packs directory, POSIX-normalized -- useful in error messages and, later, provenance during development. */
  readonly path: string;
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly system: unknown;
}

interface EntryShaped {
  readonly _id: string;
  readonly name: string;
  readonly type: string;
  readonly system?: unknown;
}

function isEntryShaped(value: unknown): value is EntryShaped {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record._id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.type === 'string'
  );
}

/**
 * Reads every entry under `packsDir`, sorted by path for a deterministic
 * result regardless of the filesystem's own directory-listing order.
 */
export function readUpstreamEntries(packsDir: string): UpstreamEntry[] {
  const entries: UpstreamEntry[] = [];

  for (const file of listFilesRecursively(packsDir)) {
    if (!file.endsWith('.json')) {
      continue;
    }

    const relativePath = toPosixRelativePath(packsDir, file);
    const raw = readFileSync(file, 'utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new Error(`malformed JSON in upstream file: ${relativePath}`, { cause });
    }

    if (!isEntryShaped(parsed)) {
      continue;
    }

    entries.push({
      path: relativePath,
      id: parsed._id,
      name: parsed.name,
      type: parsed.type,
      system: parsed.system,
    });
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
