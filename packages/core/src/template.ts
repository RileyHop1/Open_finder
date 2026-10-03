/**
 * Template: an area effect placed on a scene (a burst, cone, line, or
 * emanation) -- `docs/template.md`. A document of its own, like a token, so
 * placing or removing one writes one small row and every seat can read it.
 *
 * It stores only the shape and where it was placed. The cells it covers and
 * the creatures caught are derived from the scene's grid when needed; nothing
 * about them is stored, and nothing here applies an effect.
 */

import { z } from 'zod';

import { baseDocumentSchema } from './document.js';
import { idSchema } from './record.js';
import { MAX_SCENE_PIXELS } from './scene.js';

/** The four area shapes PF2e uses. */
export const TEMPLATE_SHAPES = ['burst', 'cone', 'line', 'emanation'] as const;

export const templateShapeSchema = z.enum(TEMPLATE_SHAPES);

export type TemplateShape = (typeof TEMPLATE_SHAPES)[number];

/** The largest template, in feet: a sanity bound, not a rule. */
export const MAX_TEMPLATE_FEET = 1000;

export const templateSchema = baseDocumentSchema.extend({
  type: z.literal('template'),
  sceneId: idSchema,
  shape: templateShapeSchema,
  /** The origin in scene pixels: a burst's centre, a cone's or line's start, an emanation's token centre. */
  x: z.number().min(0).max(MAX_SCENE_PIXELS),
  y: z.number().min(0).max(MAX_SCENE_PIXELS),
  /** Where a cone or line points, in scene pixels. Absent for a burst or emanation. */
  toX: z.number().min(0).max(MAX_SCENE_PIXELS).optional(),
  toY: z.number().min(0).max(MAX_SCENE_PIXELS).optional(),
  /** Radius (burst, emanation) or length (cone, line), in feet. */
  feet: z.number().int().min(0).max(MAX_TEMPLATE_FEET),
  /** A line's width in feet. */
  widthFeet: z.number().int().min(1).max(MAX_TEMPLATE_FEET).default(5),
  /** The token an emanation comes from. */
  tokenId: idSchema.optional(),
  /** What it is ("Fireball"), shown with it. */
  label: z.string().trim().min(1).max(100).optional(),
  /** The seat that placed it, who may also remove it. */
  placedBy: idSchema,
});

export type Template = z.infer<typeof templateSchema>;
