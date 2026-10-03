/**
 * The server's entry point: reads configuration from the environment,
 * builds the app (`app.ts`), attaches the realtime layer (`realtime.ts`),
 * and starts listening.
 *
 * Kept separate from `createApp` on purpose -- `createApp` only builds a
 * testable Fastify instance; deciding the bind address, guarding it, and
 * actually opening a socket are this file's job alone. This file has real
 * side effects (it opens a socket) and is deliberately not imported by any
 * test; see `hostGuard.ts` and `app.ts` for the parts that are.
 *
 * `activeWorld` is created once, here, and shared by both `createApp` and
 * `attachRealtime` -- the REST routes and the realtime dispatch pipeline
 * both need to know which world is live, and only one of them can own the
 * manager.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createActiveWorldManager } from './activeWorld.js';
import { createApp } from './app.js';
import { createReloadableCompendium } from './compendium.js';
import { createContentImporter, spawnImporter } from './contentImport.js';
import { assertNotAllInterfaces } from './hostGuard.js';
import { attachRealtime } from './realtime.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;

// Defaults hang off the repo root, not `process.cwd()`: `pnpm --filter` runs
// the server from `apps/server`, where `systems/pf2e` does not exist.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const worldsRoot = process.env.HEARTHTABLE_WORLDS_ROOT ?? join(repoRoot, 'worlds');
const host = process.env.HEARTHTABLE_HOST ?? DEFAULT_HOST;
const port =
  process.env.HEARTHTABLE_PORT === undefined
    ? DEFAULT_PORT
    : Number(process.env.HEARTHTABLE_PORT);
const staticDir = process.env.HEARTHTABLE_STATIC_DIR;
const compendiumDir =
  process.env.HEARTHTABLE_COMPENDIUM_DIR ??
  join(repoRoot, 'systems', 'pf2e', '.data', 'imported');

assertNotAllInterfaces(host);

const activeWorld = createActiveWorldManager();
const compendium = createReloadableCompendium(compendiumDir);

// The in-app import runs the same importer as `pnpm --filter @hearthtable/pf2e
// run import`, as a child process, writing where the compendium reads from.
// Its working directory is the pf2e package (where `tsx` resolves from); how
// this is bundled for a double-click install is ADR 0010's open question.
const importerDir =
  process.env.HEARTHTABLE_IMPORTER_DIR ?? join(repoRoot, 'systems', 'pf2e');
const contentImport = createContentImporter({
  reload: () => compendium.reload(),
  run: spawnImporter({
    command: process.execPath,
    args: ['--import', 'tsx', join('src', 'importer', 'index.ts')],
    cwd: importerDir,
    env: {
      ...process.env,
      HEARTHTABLE_PF2E_OUTPUT_DIR: compendiumDir,
      HEARTHTABLE_PF2E_UPSTREAM_DIR: join(dirname(compendiumDir), 'upstream'),
    },
    timeoutMs: 20 * 60 * 1000,
  }),
});

const app = createApp({
  worldsRoot,
  activeWorld,
  compendium,
  contentImport,
  ...(staticDir === undefined ? {} : { staticDir }),
});

attachRealtime(app.server, { activeWorld, compendium });

app
  .listen({ host, port })
  .then(() => {
    app.log.info(`worlds root: ${worldsRoot}`);
    const status = compendium.status();
    app.log.info(
      status.available
        ? `compendium: ${String(status.entryCount)} entries in ${String(status.packs.length)} packs (${String(status.skipped)} skipped) from ${compendiumDir}`
        : `compendium: nothing imported at ${compendiumDir}; the GM can import it from the table`,
    );
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exitCode = 1;
  });
