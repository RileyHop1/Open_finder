/**
 * The World: the top-level container everything else belongs to. One world
 * is one campaign, one folder on disk (`worlds/<id>/`, per CLAUDE.md's World
 * folder layout section), one SQLite database.
 *
 * Extends `baseRecordSchema`, not `baseDocumentSchema` -- a World has no
 * `worldId` (it cannot belong to itself) and no `permissions` (permission
 * levels are about what a seat can see *within* a world, which doesn't
 * apply to the world record itself).
 *
 * Which world is currently *active* -- the one the server is actually
 * serving to connecting clients -- is server runtime state, not part of
 * this schema or persisted here. See docs/world-and-seats.md.
 */

import { z } from 'zod';

import { baseRecordSchema } from './record.js';

export const worldSchema = baseRecordSchema.extend({
  name: z.string().min(1),
});

export type World = z.infer<typeof worldSchema>;
