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

import type { Seat } from '@hearthtable/core';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ActiveWorldManager } from './activeWorld.js';
import { withWorldStore } from './worldAccess.js';
import { createWorld, listWorlds } from './worldStore.js';

export interface AppOptions {
  /** Where world folders live -- see `paths.ts`. Always explicit, never defaulted here. */
  readonly worldsRoot: string;
  /**
   * Tracks which world is currently being served. Owned by the caller
   * (`index.ts`), not created here: the realtime layer (`realtime.ts`) needs
   * this exact same instance to dispatch operations against and to react
   * when the GM activates a different world, so one manager has to outlive
   * and be shared by both `createApp` and `attachRealtime` rather than each
   * building its own.
   */
  readonly activeWorld: ActiveWorldManager;
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

const createSeatBodySchema = z.object({
  name: z.string().min(1),
  isGM: z.boolean(),
  pin: z.string().min(1).max(16).optional(),
});

export function createApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });
  const { activeWorld } = options;

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

  // These two routes return the full Seat object, pin included -- not
  // redacted. Seat.pin already documents itself as not a secret (ADR 0007),
  // and this app's whole threat model is "anyone who can reach the port is
  // already trusted" (ADR 0007 again). Building selective redaction here
  // would be exactly the security theater that field's own docs warn
  // against; it protects against nothing this app's model actually defends
  // against, while adding a response shape divergent from the stored one.
  app.post('/api/worlds/:id/seats', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createSeatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      await reply
        .status(400)
        .send({ error: 'invalid request body', issues: parsed.error.issues });
      return;
    }

    try {
      const seat = withWorldStore(activeWorld, options.worldsRoot, id, (store) => {
        const now = new Date().toISOString();
        const newSeat: Seat = {
          id: crypto.randomUUID(),
          worldId: id,
          schemaVersion: 1,
          name: parsed.data.name,
          isGM: parsed.data.isGM,
          createdAt: now,
          updatedAt: now,
          ...(parsed.data.pin === undefined ? {} : { pin: parsed.data.pin }),
        };
        store.putSeat(newSeat);
        return newSeat;
      });
      await reply.status(201).send(seat);
    } catch {
      await reply.status(404).send({ error: `no world found with id ${id}` });
    }
  });

  app.get('/api/worlds/:id/seats', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const seats = withWorldStore(activeWorld, options.worldsRoot, id, (store) =>
        store.listSeats(),
      );
      await reply.send(seats);
    } catch {
      await reply.status(404).send({ error: `no world found with id ${id}` });
    }
  });

  if (options.staticDir !== undefined && existsSync(options.staticDir)) {
    void app.register(fastifyStatic, { root: options.staticDir });
  }

  return app;
}
