/**
 * The Fastify app: REST endpoints for world setup (list, create, activate)
 * and, once `staticDir` is provided and exists, the built client's static
 * files. See ADR 0005 for why operations (not built yet) are the real
 * mutation path; these routes are setup/administration, outside that flow.
 *
 * `createApp` only builds the app -- it never calls `.listen()`. Host, port,
 * and the binding safety check belong to the actual entry point
 * (`index.ts`), which is what makes this factory testable with Fastify's
 * `.inject()` against a real router with no open socket.
 */

import { existsSync } from 'node:fs';

import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createActiveWorldManager } from './activeWorld.js';
import { createWorld, listWorlds } from './worldStore.js';

export interface AppOptions {
  /** Where world folders live -- see `paths.ts`. Always explicit, never defaulted here. */
  readonly worldsRoot: string;
  /**
   * The built client's output directory, if there is one to serve.
   * Optional and usually absent for now: `apps/client` has no build yet.
   * When present and it exists on disk, its files are served at `/`.
   */
  readonly staticDir?: string;
  /** Defaults to true. Tests pass false to keep their output readable. */
  readonly logger?: boolean;
}

const createWorldBodySchema = z.object({ name: z.string().min(1) });

export function createApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });
  const activeWorld = createActiveWorldManager();

  app.get('/api/worlds', () => listWorlds(options.worldsRoot));

  app.post('/api/worlds', async (request, reply) => {
    const parsed = createWorldBodySchema.safeParse(request.body);
    if (!parsed.success) {
      await reply
        .status(400)
        .send({ error: 'invalid request body', issues: parsed.error.issues });
      return;
    }
    const store = createWorld(options.worldsRoot, parsed.data.name);
    const { world } = store;
    // Creating a world does not activate it -- these are deliberately
    // separate steps, matching the GM's own "create ahead of time, activate
    // later" workflow. Close it immediately rather than leaking a handle.
    store.close();
    await reply.status(201).send(world);
  });

  app.post('/api/worlds/:id/activate', async (request, reply) => {
    // Fastify's router always produces a string for a ":id" segment; this
    // is a description of a guaranteed runtime shape, not an unchecked
    // assumption about caller-supplied data.
    const { id } = request.params as { id: string };
    try {
      const store = activeWorld.set(options.worldsRoot, id);
      await reply.send(store.world);
    } catch {
      await reply.status(404).send({ error: `no world found with id ${id}` });
    }
  });

  app.get('/api/worlds/active', async (_request, reply) => {
    const store = activeWorld.get();
    if (store === undefined) {
      await reply.status(404).send({ error: 'no world is currently active' });
      return;
    }
    await reply.send(store.world);
  });

  if (options.staticDir !== undefined && existsSync(options.staticDir)) {
    void app.register(fastifyStatic, { root: options.staticDir });
  }

  app.addHook('onClose', () => {
    activeWorld.clear();
  });

  return app;
}
