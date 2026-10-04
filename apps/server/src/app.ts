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

import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

import type { Seat } from '@hearthtable/core';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ActiveWorldManager } from './activeWorld.js';
import type { CompendiumIndex } from './compendium.js';
import { emptyCompendium, MAX_SEARCH_LIMIT } from './compendium.js';
import type { ContentImporter } from './contentImport.js';
import {
  contentTypeOfAsset,
  IMAGE_TYPES,
  InvalidAssetError,
  storeAsset,
} from './assets.js';
import { resolveWorldPaths } from './paths.js';
import { readableDocuments } from './visibility.js';
import { withWorldStore } from './worldAccess.js';
import { exportWorldArchive, importWorldArchive } from './worldArchive.js';
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
  /**
   * The imported compendium (`compendium.ts`, ADR 0015). Absent means an empty
   * one: the routes still answer, saying nothing is available.
   */
  readonly compendium?: CompendiumIndex;
  /**
   * Runs the content import from inside the app (`contentImport.ts`, ADR 0016).
   * Absent means the routes say importing is not available here.
   */
  readonly contentImport?: ContentImporter;
  /** Defaults to true. Tests pass false to keep their output readable. */
  readonly logger?: boolean;
}

// Assets are explicitly unbounded (CLAUDE.md's Storage section: "no size
// limit... this is a table for friends, not a public service"), so
// Fastify's 1 MiB default body limit would break importing any campaign
// that has grown past a trivial size.
const WORLD_ARCHIVE_BODY_LIMIT = 4 * 1024 * 1024 * 1024; // 4 GiB

/**
 * Keeps a downloaded archive's filename to `[a-z0-9-]` only. A world's name
 * is freeform GM-chosen text (CLAUDE.md's Seats section: no validation on
 * it beyond non-empty) -- without this, a name containing `"` or a CRLF
 * could inject into the `Content-Disposition` response header rather than
 * just render oddly.
 */
function slugForFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'world';
}

const createWorldBodySchema = z.object({ name: z.string().min(1) });

const createSeatBodySchema = z.object({
  name: z.string().min(1),
  isGM: z.boolean(),
  pin: z.string().min(1).max(16).optional(),
});

const compendiumSearchQuerySchema = z.object({
  kind: z.string().min(1).max(40).optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
});

export function createApp(options: AppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: WORLD_ARCHIVE_BODY_LIMIT,
  });
  const { activeWorld } = options;
  const compendium = options.compendium ?? emptyCompendium();

  // Hands the raw upload stream straight to the import route below instead
  // of buffering it -- the whole point of `importWorldArchive`'s own
  // streaming reader (`worldArchive.ts`).
  app.addContentTypeParser('application/octet-stream', (_request, payload, done) => {
    done(null, payload);
  });

  // Image uploads (portraits now, maps later) arrive as the raw file with its
  // own media type, so the body can stream to disk (`assets.ts`) instead of
  // being buffered or parsed as multipart.
  for (const mediaType of Object.keys(IMAGE_TYPES)) {
    app.addContentTypeParser(mediaType, (_request, payload, done) => {
      done(null, payload);
    });
  }

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

  // GM only, the same device-token check `/api/compendium/import` uses:
  // leaving a campaign disconnects every seat at the table, not just the
  // caller's own browser, so a player hitting this by accident would kick
  // everyone else out mid-session.
  app.post('/api/worlds/active/deactivate', async (request, reply) => {
    const store = activeWorld.get();
    if (store === undefined) {
      await reply.status(404).send({ error: 'no world is currently active' });
      return;
    }
    const deviceToken = request.headers['x-device-token'];
    const seat =
      typeof deviceToken === 'string' && deviceToken.length > 0
        ? store.getSeatByDeviceToken(deviceToken)
        : undefined;
    if (seat?.isGM !== true) {
      await reply.status(403).send({ error: 'only the GM can leave the campaign' });
      return;
    }
    activeWorld.clear();
    await reply.status(204).send();
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

  // Filtered to what the caller's seat may read (`visibility.ts`). The caller is
  // identified by an `x-device-token` header -- the same token the socket
  // handshake carries -- and a request with none is judged as a viewer with no
  // seat, who gets each document's default level. This is spoiler protection,
  // not access control (ADR 0007).
  //
  // Generic on purpose, the same way WorldStore.listDocuments itself is: this
  // route doesn't know Actor from ChatMessage, so it returns raw stored JSON
  // rather than validating against any one concrete schema. A caller that
  // wants a specific type -- the client's chat history fetch, e.g.
  // `?type=chatMessage` -- validates the response itself, the same way it
  // already validates a Broadcast's own `documents` array.
  app.get('/api/worlds/:id/documents', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { type } = request.query as { type?: string };
    try {
      const deviceToken = request.headers['x-device-token'];
      const documents = withWorldStore(activeWorld, options.worldsRoot, id, (store) => {
        const seat =
          typeof deviceToken === 'string' && deviceToken.length > 0
            ? store.getSeatByDeviceToken(deviceToken)
            : undefined;
        return readableDocuments(seat, store.listDocuments(type));
      });
      await reply.send(documents);
    } catch {
      await reply.status(404).send({ error: `no world found with id ${id}` });
    }
  });

  // Streams the archive straight to the response (`exportWorldArchive` reads
  // assets off disk one chunk at a time) rather than building it up first --
  // `reply.send` recognizes a Readable and pipes it. `store.serialize()`
  // runs synchronously here, inside `withWorldStore`'s callback, so it's
  // guaranteed a live database handle regardless of whether that's the
  // active world's connection or a fresh one this call opened and will
  // close right after -- the returned stream itself no longer needs either,
  // since by then it only holds the already-extracted bytes and a plain
  // filesystem path to the assets directory.
  app.get('/api/worlds/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { stream, world } = withWorldStore(
        activeWorld,
        options.worldsRoot,
        id,
        (store) => {
          const paths = resolveWorldPaths(options.worldsRoot, id);
          return {
            stream: exportWorldArchive(store.world, store.serialize(), paths.assetsDir),
            world: store.world,
          };
        },
      );
      const filename = `${slugForFilename(world.name)}-${world.id}.htworld`;
      await reply
        .header('content-type', 'application/octet-stream')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(stream);
    } catch {
      await reply.status(404).send({ error: `no world found with id ${id}` });
    }
  });

  // Bare `/api/worlds/import`, not `/api/worlds/:id/import`: importing
  // creates a brand-new world (see `importWorldArchive`'s own doc comment
  // on why it preserves the archived id rather than minting one), so there
  // is no existing id to route through -- the same reason `POST
  // /api/worlds` (create) has no id segment either.
  app.post('/api/worlds/import', async (request, reply) => {
    try {
      const world = await importWorldArchive(
        options.worldsRoot,
        request.body as Readable,
      );
      await reply.status(201).send(world);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'failed to import world archive';
      await reply.status(400).send({ error: message });
    }
  });

  // Any seated player may upload an image: portraits are the player's own, and
  // the table is trusted (ADR 0007). A caller with no seat is refused so a
  // stranger on the network cannot fill the GM's disk.
  app.post('/api/worlds/:id/assets', async (request, reply) => {
    const { id } = request.params as { id: string };
    const deviceToken = request.headers['x-device-token'];
    let seated: boolean;
    try {
      if (!z.uuid().safeParse(id).success) {
        throw new Error('not a world id');
      }
      seated = withWorldStore(activeWorld, options.worldsRoot, id, (store) =>
        typeof deviceToken === 'string' && deviceToken.length > 0
          ? store.getSeatByDeviceToken(deviceToken) !== undefined
          : false,
      );
    } catch {
      await reply.status(404).send({ error: `no world found with id ${id}` });
      return;
    }
    if (!seated) {
      await reply.status(403).send({ error: 'claim a seat before uploading' });
      return;
    }
    const mediaType = (request.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
    try {
      const stored = await storeAsset(
        resolveWorldPaths(options.worldsRoot, id).assetsDir,
        mediaType,
        request.body as Readable,
      );
      await reply.status(201).send({
        ...stored,
        url: `/api/worlds/${id}/assets/${stored.name}`,
      });
    } catch (caught) {
      if (caught instanceof InvalidAssetError) {
        await reply.status(400).send({ error: caught.message });
        return;
      }
      throw caught;
    }
  });

  // Readable by anyone who can reach the table: an <img> tag cannot send the
  // device header. The name must be exactly `<hash>.<ext>`, so no request
  // parameter can name another path; the world id is checked by the lookup.
  app.get('/api/worlds/:id/assets/:name', async (request, reply) => {
    const { id, name } = request.params as { id: string; name: string };
    const contentType = contentTypeOfAsset(name);
    // A world id is a UUID; anything else cannot name a folder, so it never
    // reaches the filesystem.
    const file =
      contentType !== undefined && z.uuid().safeParse(id).success
        ? join(resolveWorldPaths(options.worldsRoot, id).assetsDir, name)
        : undefined;
    if (contentType === undefined || file === undefined || !existsSync(file)) {
      await reply.status(404).send({ error: 'no such asset' });
      return;
    }
    await reply
      .header('content-type', contentType)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(createReadStream(file));
  });

  // The compendium is read-only reference data, public to every seat: it is
  // the imported rules content, not anything a world owns (ADR 0015).
  app.get('/api/compendium', () => compendium.status());

  // Importing the content is the GM's, because it downloads onto this
  // computer and replaces what every seat searches. Its status is open to all:
  // a player seeing "the GM has not imported anything yet" is useful.
  app.get('/api/compendium/import', async (_request, reply) => {
    if (options.contentImport === undefined) {
      await reply
        .status(404)
        .send({ error: 'importing is not available on this server' });
      return;
    }
    await reply.send(options.contentImport.status());
  });

  app.post('/api/compendium/import', async (request, reply) => {
    const importer = options.contentImport;
    if (importer === undefined) {
      await reply
        .status(404)
        .send({ error: 'importing is not available on this server' });
      return;
    }
    const deviceToken = request.headers['x-device-token'];
    const seat =
      typeof deviceToken === 'string' && deviceToken.length > 0
        ? activeWorld.get()?.getSeatByDeviceToken(deviceToken)
        : undefined;
    if (seat?.isGM !== true) {
      await reply.status(403).send({ error: 'only the GM can import game content' });
      return;
    }
    const started = importer.start();
    await reply.status(started === 'started' ? 202 : 409).send(importer.status());
  });

  app.get('/api/compendium/search', async (request, reply) => {
    const parsed = compendiumSearchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      await reply
        .status(400)
        .send({ error: 'invalid search query', issues: parsed.error.issues });
      return;
    }
    await reply.send(compendium.search(parsed.data));
  });

  app.get('/api/compendium/:packId/:slug', async (request, reply) => {
    const { packId, slug } = request.params as { packId: string; slug: string };
    const entry = compendium.get(packId, slug);
    if (entry === undefined) {
      await reply.status(404).send({ error: `no compendium entry ${packId}/${slug}` });
      return;
    }
    await reply.send(entry);
  });

  if (options.staticDir !== undefined && existsSync(options.staticDir)) {
    void app.register(fastifyStatic, { root: options.staticDir });
  }

  return app;
}
