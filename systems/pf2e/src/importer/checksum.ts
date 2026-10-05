/**
 * Content-checksumming for the importer's fetch step (ADR 0011). Pure
 * filesystem + crypto, no git -- `fetchUpstream.ts` calls this after
 * checking out the pinned commit, and a contributor re-pinning runs it by
 * hand to get the value that goes in `upstream.ts`.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listFilesRecursively, toPosixRelativePath } from './listFiles.js';

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

/**
 * Sha256 over a single file's bytes alone -- no path mixed in, unlike
 * `checksumPacks`, because this pins exactly one fixed, known file
 * (`static/lang/en.json`, ADR 0020's `UPSTREAM_LANG_CHECKSUM`) rather than
 * a directory tree whose membership could itself shift.
 */
export function checksumFile(filePath: string): string {
  const hash = createHash('sha256').update(readFileSync(filePath));
  return `sha256:${hash.digest('hex')}`;
}
