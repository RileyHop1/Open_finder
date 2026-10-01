/**
 * Importing the game content from inside the app, so the GM never opens a
 * terminal (CLAUDE.md, Distribution; ADR 0016). Two pieces:
 *
 * - `createContentImporter` is the small state machine the routes talk to:
 *   idle, running, done, or failed, one import at a time. It knows nothing
 *   about processes; it is handed a `run` function and a `reload` function.
 * - `spawnImporter` is the real `run`: it starts the same importer the
 *   command line runs (`systems/pf2e/src/importer`, with the same pinned
 *   upstream commit and checksum) as a **child process**. The importer reads
 *   tens of thousands of files synchronously; in this process that would
 *   freeze every connected table for as long as it took.
 *
 * The importer never prints an entry's name (ADR 0003), so nothing it says
 * is Paizo content and its last lines are safe to show when it fails.
 */

import { spawn } from 'node:child_process';

import type { CompendiumStatus } from './compendium.js';

export type ImportState =
  | { readonly state: 'idle' }
  | { readonly state: 'running'; readonly startedAt: string }
  | { readonly state: 'done'; readonly finishedAt: string; readonly entryCount: number }
  | {
      readonly state: 'failed';
      readonly finishedAt: string;
      /** What went wrong, in words a GM can act on. */
      readonly message: string;
      /** The importer's last output, for someone who needs to dig. */
      readonly detail?: string;
    };

export type ImportOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly detail?: string };

export interface ContentImporter {
  status(): ImportState;
  /** Starts an import unless one is already running. Returns without waiting for it. */
  start(): 'started' | 'already-running';
}

export interface ContentImporterOptions {
  /** Does the import. Must resolve (never reject) with the outcome. */
  readonly run: () => Promise<ImportOutcome>;
  /** Swaps the freshly written packs into the live compendium. */
  readonly reload: () => CompendiumStatus;
  /** For tests. */
  readonly now?: () => Date;
}

export function createContentImporter(options: ContentImporterOptions): ContentImporter {
  const now = options.now ?? (() => new Date());
  let state: ImportState = { state: 'idle' };

  async function execute(): Promise<void> {
    let outcome: ImportOutcome;
    try {
      outcome = await options.run();
    } catch (caught) {
      outcome = {
        ok: false,
        message: 'The import stopped unexpectedly.',
        detail: caught instanceof Error ? caught.message : String(caught),
      };
    }
    if (!outcome.ok) {
      state = {
        state: 'failed',
        finishedAt: now().toISOString(),
        message: outcome.message,
        ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
      };
      return;
    }
    try {
      const status = options.reload();
      state = {
        state: 'done',
        finishedAt: now().toISOString(),
        entryCount: status.entryCount,
      };
    } catch (caught) {
      state = {
        state: 'failed',
        finishedAt: now().toISOString(),
        message: 'The content was downloaded but could not be loaded.',
        detail: caught instanceof Error ? caught.message : String(caught),
      };
    }
  }

  return {
    status: () => state,
    start() {
      if (state.state === 'running') {
        return 'already-running';
      }
      state = { state: 'running', startedAt: now().toISOString() };
      void execute();
      return 'started';
    },
  };
}

/** How many trailing lines of the importer's output are kept for `detail`. */
const DETAIL_LINES = 8;

/**
 * Turns the importer's failure output into a sentence a GM can act on. The
 * likely failures are all about the machine, not the content: git missing, no
 * network, a download that does not match the pinned checksum.
 */
export function explainFailure(output: string): string {
  if (
    /spawnSync git ENOENT|git: command not found|'git' is not recognized/i.test(output)
  ) {
    return 'Git is not installed on this computer (or is not on its PATH). Install Git, then try again.';
  }
  if (/checksum/i.test(output)) {
    return 'The downloaded rules data did not match the version this app expects, so nothing was imported.';
  }
  if (
    /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|Could not resolve host|unable to access|Failed to connect|Connection timed out/i.test(
      output,
    )
  ) {
    return 'Could not download the rules data. Check this computer’s internet connection and try again.';
  }
  return 'The import failed.';
}

export interface SpawnImporterOptions {
  /** The program to run: the Node binary, in production. */
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** Give up and kill it after this long. */
  readonly timeoutMs: number;
}

/** The real `run`: starts the importer as a child process and reports how it ended. */
export function spawnImporter(
  options: SpawnImporterOptions,
): () => Promise<ImportOutcome> {
  return () =>
    new Promise<ImportOutcome>((resolve) => {
      const lines: string[] = [];
      const keep = (chunk: Buffer): void => {
        lines.push(
          ...chunk
            .toString('utf8')
            .split(/\r?\n/)
            .filter((l) => l.trim() !== ''),
        );
        if (lines.length > 200) {
          lines.splice(0, lines.length - 200);
        }
      };

      let timedOut = false;
      const child = spawn(options.command, [...options.args], {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs);

      child.stdout.on('data', keep);
      child.stderr.on('data', keep);
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          message: 'The import could not start.',
          detail: error.message,
        });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && !timedOut) {
          resolve({ ok: true });
          return;
        }
        const output = lines.join('\n');
        resolve({
          ok: false,
          message: timedOut
            ? 'The import took too long and was stopped. Try again.'
            : explainFailure(output),
          detail: lines.slice(-DETAIL_LINES).join('\n'),
        });
      });
    });
}
