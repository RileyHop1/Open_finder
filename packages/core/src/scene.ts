/**
 * Scene: a map, a grid, and the links out of it -- see CLAUDE.md's Game flow
 * and ADR 0017. Tokens are not in here; each is its own document
 * (`token.ts`), so a move rewrites one small row rather than the scene.
 *
 * All positions in a scene are in **scene pixels**: a coordinate space of
 * `width` x `height` that the background image is stretched to fill. Keeping
 * them independent of the image's own resolution is what lets a client
 * downscale a huge map to fit its GPU without moving anything.
 */

import { z } from 'zod';

import { baseDocumentSchema } from './document.js';
import { idSchema } from './record.js';

/** What a scene is for; CLAUDE.md's Game flow describes each. */
export const SCENE_KINDS = ['overworld', 'area', 'battle'] as const;

export const sceneKindSchema = z.enum(SCENE_KINDS);

export type SceneKind = (typeof SCENE_KINDS)[number];

/** `square` snaps and measures in cells; `none` is freeform (docs/grid.md). */
export const GRID_TYPES = ['square', 'none'] as const;

export const gridTypeSchema = z.enum(GRID_TYPES);

export type GridType = (typeof GRID_TYPES)[number];

/** The largest a scene may be on a side, in scene pixels. */
export const MAX_SCENE_PIXELS = 32_000;

export const sceneGridSchema = z.object({
  type: gridTypeSchema.default('square'),
  /** One cell's side, in scene pixels. */
  size: z.number().int().min(10).max(1000).default(100),
  /** How far one cell is, in feet. PF2e's default is 5. */
  distance: z.number().positive().max(1000).default(5),
  /** Shift of the grid lines from the scene's top-left, so the grid can be lined up with a map's printed one. */
  offsetX: z.number().min(-1000).max(1000).default(0),
  offsetY: z.number().min(-1000).max(1000).default(0),
});

export type SceneGrid = z.infer<typeof sceneGridSchema>;

/** An exit: a marked point that takes the party to another scene. */
export const sceneLinkSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  x: z.number().min(0).max(MAX_SCENE_PIXELS),
  y: z.number().min(0).max(MAX_SCENE_PIXELS),
  /** Whether this id names a scene that exists is the server's check, not the schema's. */
  targetSceneId: idSchema,
});

export type SceneLink = z.infer<typeof sceneLinkSchema>;

export const sceneSchema = baseDocumentSchema
  .extend({
    type: z.literal('scene'),
    name: z.string().min(1),
    kind: sceneKindSchema,
    /** The scene's coordinate space, in scene pixels. */
    width: z.number().int().min(100).max(MAX_SCENE_PIXELS).default(2000),
    height: z.number().int().min(100).max(MAX_SCENE_PIXELS).default(2000),
    /**
     * The map image, as a content-addressed asset name (`<hash>.<ext>`, see
     * docs/assets.md). Absent means a blank scene; there is no default image.
     */
    background: z.string().min(1).optional(),
    grid: sceneGridSchema.default(() => sceneGridSchema.parse({})),
    links: z.array(sceneLinkSchema).default([]),
  })
  .refine(
    (scene) => new Set(scene.links.map((link) => link.id)).size === scene.links.length,
    {
      message: 'a scene cannot list the same link twice',
      path: ['links'],
    },
  );

export type Scene = z.infer<typeof sceneSchema>;
