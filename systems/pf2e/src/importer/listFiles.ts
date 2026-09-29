/**
 * Small filesystem helpers shared by every importer stage that walks a
 * fetched `packs/` directory -- `checksum.ts` (hashes every file) and
 * `reader.ts` (reads every JSON file). Extracted here now that a second
 * real caller needs it, per this project's usual threshold for sharing a
 * piece (see `apps/server/src/transaction.ts`'s module doc).
 */

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Every file (not directory) under `rootDir`, as absolute paths, in no particular order. */
export function listFilesRecursively(rootDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        files.push(full);
      }
    }
  };
  walk(rootDir);
  return files;
}

/** `file`'s path relative to `rootDir`, with OS-specific separators normalized to `/` -- so a result doesn't depend on whether it was computed on Windows or Linux. */
export function toPosixRelativePath(rootDir: string, file: string): string {
  return relative(rootDir, file).split(sep).join('/');
}
