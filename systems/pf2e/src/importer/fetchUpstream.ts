/**
 * The fetch half of ADR 0011's pipeline: `git init` a throwaway working
 * tree, sparse-checkout `packs/` only, and fetch the pinned commit by SHA.
 *
 * `buildFetchCommands` is exported separately from `fetchUpstream` so the
 * exact git invocation sequence is unit-testable without a real git process
 * or network access -- the same reasoning `apps/server`'s
 * `applyMigrations`/`runMigrations` split uses. `fetchUpstream` itself is
 * exercised for real by the importer CLI and CI's `import-smoke` job
 * (ADR 0013), not by a hermetic unit test.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';

export interface FetchUpstreamOptions {
  readonly repo: string;
  readonly commit: string;
  /** Directory to fetch into. Removed and recreated if it already exists -- a fetch is always a clean checkout of the pin, never an incremental update. */
  readonly targetDir: string;
}

/**
 * The git commands `fetchUpstream` runs, in order, each as an argv array
 * ready for `execFileSync('git', argv, ...)`.
 */
export function buildFetchCommands(
  options: FetchUpstreamOptions,
): readonly (readonly string[])[] {
  return [
    ['init', '-q'],
    ['remote', 'add', 'origin', options.repo],
    ['sparse-checkout', 'init', '--cone'],
    // `static/lang` alongside `packs` -- ADR 0020's trait glossary reads
    // `static/lang/en.json` under its own pinned checksum.
    ['sparse-checkout', 'set', 'packs', 'static/lang'],
    // Windows: upstream's packs/ has at least one path deep enough to hit
    // the legacy MAX_PATH limit without this -- hit directly against the
    // real repo during this importer's own development, not a hypothetical.
    ['config', 'core.longpaths', 'true'],
    ['fetch', '--depth', '1', 'origin', options.commit],
    ['checkout', '-q', 'FETCH_HEAD'],
  ];
}

/**
 * Runs `buildFetchCommands` against `options.targetDir`, which is wiped
 * first so every fetch starts from a clean slate.
 */
export function fetchUpstream(options: FetchUpstreamOptions): void {
  if (existsSync(options.targetDir)) {
    rmSync(options.targetDir, { recursive: true, force: true });
  }
  mkdirSync(options.targetDir, { recursive: true });

  for (const command of buildFetchCommands(options)) {
    execFileSync('git', command, { cwd: options.targetDir, stdio: 'pipe' });
  }
}
