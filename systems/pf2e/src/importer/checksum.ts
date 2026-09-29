/**
 * Content-checksumming for the importer's fetch step (ADR 0011). Pure
 * filesystem + crypto, no git -- `fetchUpstream.ts` calls this after
 * checking out the pinned commit, and a contributor re-pinning runs it by
 * hand to get the value that goes in `upstream.ts`.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function listFilesRecursively(rootDir: string): string[] {
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

/** `path`, with OS-specific separators normalized to `/` -- so the checksum doesn't depend on whether it was computed on Windows or Linux (dev machine vs. CI). */
function toPosixRelativePath(rootDir: string, file: string): string {
  return relative(rootDir, file).split(sep).join('/');
}

/**
 * Sha256 over every file under `rootDir`, sorted by (normalized) relative
 * path, hashing the path and the bytes together for each -- path first, so
 * a rename is a different checksum even with byte-identical content. See
 * ADR 0011: this is the independent signal that catches a moved ref, on top
 * of (not instead of) pinning the commit SHA itself.
 *
 * Returns `sha256:<hex>`, matching the label style already used for a
 * `RollResult.seed` and a pack manifest's `packsChecksum`.
 */
export function checksumPacks(rootDir: string): string {
  const relativePaths = listFilesRecursively(rootDir)
    .map((file) => toPosixRelativePath(rootDir, file))
    .sort();

  const hash = createHash('sha256');
  for (const relativePath of relativePaths) {
    hash.update(relativePath);
    // A NUL separator between the path and its bytes -- a path can't
    // contain one, so this keeps "a/b" + "c" distinguishable from "a" +
    // "bc" if two files' names and contents were ever concatenated without
    // a boundary.
    hash.update('\0');
    hash.update(readFileSync(join(rootDir, relativePath)));
  }
  return `sha256:${hash.digest('hex')}`;
}
