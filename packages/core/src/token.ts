/**
 * Token: one actor's marker on one scene -- see ADR 0017. A document of its
 * own, not an entry inside the scene, so that a settled move writes and
 * broadcasts one small row, and so that a hidden token is simply a document a
 * player is not allowed to read.
 *
 * Core stays system-agnostic: `size` is a footprint in grid squares, and
 * the game system decides what that is for a creature (`systems/pf2e`'s
 * size-to-footprint mapping).
 */

import { z } from 'zod';

import { baseDocumentSchema } from './document.js';
import { idSchema } from './record.js';
import { MAX_SCENE_PIXELS } from './scene.js';

/** The largest footprint a token may have, in squares per side. */
export const MAX_TOKEN_SIZE = 12;

export const tokenSchema = baseDocumentSchema.extend({
  type: z.literal('token'),
  sceneId: idSchema,
  actorId: idSchema,
  /** A label that replaces the actor's name on the map (two goblins, "Goblin 2"). Absent means the actor's name. */
  name: z.string().min(1).optional(),
  /** The token's **centre**, in scene pixels. */
  x: z.number().min(0).max(MAX_SCENE_PIXELS),
  y: z.number().min(0).max(MAX_SCENE_PIXELS),
  /** Footprint in grid squares per side: 1 for a Medium creature, 2 for a Large one. */
  size: z.number().int().min(1).max(MAX_TOKEN_SIZE).default(1),
  /** Whether players can see it. The server derives the permissions from this and the scene, never the client. */
  hidden: z.boolean().default(false),
  /** Whether players see this token's HP bar. A character's bar is always shown; this is the GM's per-token switch for a monster, off by default. */
  showHpBar: z.boolean().default(false),
  /**
   * The health a player may see: current and maximum hit points. **Server-maintained**
   * and never set by a client (`token.update` has no such field), so a player can read
   * "12/40" on a shown monster without ever receiving its stat block. Absent until the
   * server first fills it. An old stored `{ percent }` from before this shape reads as
   * absent and is refilled the next time the monster or token changes.
   */
  hpBar: z
    .object({ current: z.number().int().min(0), max: z.number().int().min(0) })
    .optional()
    .catch(undefined),
});

export type Token = z.infer<typeof tokenSchema>;
