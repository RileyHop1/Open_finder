/**
 * Actor: a PC, NPC, or hazard -- see CLAUDE.md's Architecture section and
 * ADR 0014. This is the system-agnostic envelope only: core validates the
 * shared fields and that `system` is an object, and never looks inside it.
 * A game system's own schema (`systems/pf2e`'s `characterDataSchema`) owns
 * that payload, and the server validates it after every mutation.
 */

import { z } from 'zod';

import { baseDocumentSchema } from './document.js';
import { hotbarSchema, situationalModifiersSchema } from './quickbar.js';

/** What sort of thing an actor is. Hazards join the same document type rather than getting their own (CLAUDE.md: "Actor: PC, NPC, hazard"). */
export const ACTOR_KINDS = ['character', 'npc', 'hazard'] as const;

export const actorKindSchema = z.enum(ACTOR_KINDS);

export type ActorKind = (typeof ACTOR_KINDS)[number];

export const actorSchema = baseDocumentSchema.extend({
  type: z.literal('actor'),
  kind: actorKindSchema,
  name: z.string().min(1),
  /**
   * The content-addressed asset (`<hash>.<ext>`, see the world folder layout
   * in CLAUDE.md) shown as this actor's portrait. Absent means "show the
   * placeholder"; there is no default image to store.
   */
  portrait: z.string().min(1).optional(),
  /** The game system's own data. Opaque to core; see ADR 0014. */
  system: z.record(z.string(), z.unknown()),
  /** Situational modifiers the player keeps ready ("Flanking +2"), switched on or off per roll. Absent until first saved. Changed only through `actor.setQuickbar`. */
  modifiers: situationalModifiersSchema.optional(),
  /** The saved-action hotbar: ten slots, keys 1 to 9 then 0. Absent until first saved. Changed only through `actor.setQuickbar`. */
  hotbar: hotbarSchema.optional(),
});

export type Actor = z.infer<typeof actorSchema>;
