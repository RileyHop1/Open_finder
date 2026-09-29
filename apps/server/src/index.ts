/**
 * The server's entry point: reads configuration from the environment,
 * builds the app (`app.ts`), and starts listening.
 *
 * Kept separate from `createApp` on purpose -- `createApp` only builds a
 * testable Fastify instance; deciding the bind address, guarding it, and
 * actually opening a socket are this file's job alone. This file has real
 * side effects (it opens a socket) and is deliberately not imported by any
 * test; see `hostGuard.ts` and `app.ts` for the parts that are.
 */

import { join } from 'node:path';

import { createApp } from './app.js';
import { assertNotAllInterfaces } from './hostGuard.js';

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

const app = createApp({
  worldsRoot,
  ...(staticDir === undefined ? {} : { staticDir }),
});

app
  .listen({ host, port })
  .then(() => {
    app.log.info(`worlds root: ${worldsRoot}`);
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exitCode = 1;
  });
