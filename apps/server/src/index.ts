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

import { join } from 'node:path';

import { createActiveWorldManager } from './activeWorld.js';
import { createApp } from './app.js';
import { assertNotAllInterfaces } from './hostGuard.js';
import { attachRealtime } from './realtime.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;

const worldsRoot = process.env.HEARTHTABLE_WORLDS_ROOT ?? join(process.cwd(), 'worlds');
const host = process.env.HEARTHTABLE_HOST ?? DEFAULT_HOST;
const port =
  process.env.HEARTHTABLE_PORT === undefined
    ? DEFAULT_PORT
    : Number(process.env.HEARTHTABLE_PORT);
const staticDir = process.env.HEARTHTABLE_STATIC_DIR;

assertNotAllInterfaces(host);

const activeWorld = createActiveWorldManager();

const app = createApp({
  worldsRoot,
  activeWorld,
  ...(staticDir === undefined ? {} : { staticDir }),
});

attachRealtime(app.server, { activeWorld });

app
  .listen({ host, port })
  .then(() => {
    app.log.info(`worlds root: ${worldsRoot}`);
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exitCode = 1;
  });
