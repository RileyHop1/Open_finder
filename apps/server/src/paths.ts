/**
 * Resolves the on-disk layout for a single world, per CLAUDE.md's World
 * folder layout section:
 *
 * ```
 * worlds/<world-id>/
 *   world.db          # SQLite, one file (ADR 0002, ADR 0009)
 *   world.json        # id, name, schemaVersion, created/updated
 *   assets/
 *     <hash>.<ext>    # content-addressed; dedupe falls out of this
 *   snapshots/
 *     <timestamp>.db  # periodic, plus one before every migration
 * ```
 *
 * `worldsRoot` -- where the `worlds/` directory itself lives -- is always an
 * explicit parameter, never a default baked in here. Where the running
 * server actually points it is a wiring decision for the app's entry point,
 * not this module's concern; keeping it explicit also means tests never
 * risk touching a real project's `worlds/` folder.
 */

import { join } from 'node:path';

export interface WorldPaths {
  readonly root: string;
  readonly databaseFile: string;
  readonly manifestFile: string;
  readonly assetsDir: string;
  readonly snapshotsDir: string;
}

export function resolveWorldPaths(worldsRoot: string, worldId: string): WorldPaths {
  const root = join(worldsRoot, worldId);
  return {
    root,
    databaseFile: join(root, 'world.db'),
    manifestFile: join(root, 'world.json'),
    assetsDir: join(root, 'assets'),
    snapshotsDir: join(root, 'snapshots'),
  };
}
