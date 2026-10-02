/**
 * Combat and Combatant: one encounter, and one token's place in it -- see
 * ADR 0018. A combat holds only where the encounter is in time; each
 * combatant is a document of its own (as a token is, ADR 0017), so a hidden
 * monster is simply a document a player may not read and spending one action
 * writes one small row.
 *
 * Nothing here knows what a rule is. *When* a condition ends, how initiative
 * ties break, and what a turn's counters mean are `systems/pf2e`'s; core stores
 * the facts. The initiative **order is never stored**: it is derived from the
 * combatants, so adding one or fixing an initiative changes no other document.
 */

import { z } from 'zod';

import { baseDocumentSchema } from './document.js';
import { idSchema } from './record.js';

/**
 * Where a combat is: `pending` (set up, not begun), `active` (rounds are
 * running), or `ended` (kept as a record until the GM deletes it). Only one combat
 * per world may be `active`; that is the server's check, not the schema's.
 */
export const COMBAT_STATUSES = ['pending', 'active', 'ended'] as const;

export const combatStatusSchema = z.enum(COMBAT_STATUSES);

export type CombatStatus = (typeof COMBAT_STATUSES)[number];

/** The most rounds a combat can reach: a sanity bound, not a rule. */
export const MAX_ROUND = 9999;

export const combatSchema = baseDocumentSchema.extend({
  type: z.literal('combat'),
  /** The scene the fight is on. Whether it exists is the server's check, not the schema's. */
  sceneId: idSchema,
  status: combatStatusSchema.default('pending'),
  /** 0 until the combat starts, then 1 and counting. */
  round: z.number().int().min(0).max(MAX_ROUND).default(0),
  /**
   * Whose turn it is: a combatant's id, never a position in a list, so a late
   * arrival cannot move the pointer to the wrong creature. Absent before the
   * combat starts and after it ends. A player may not be able to read this
   * combatant (a hidden creature acting).
   */
  activeCombatantId: idSchema.optional(),
});

export type Combat = z.infer<typeof combatSchema>;

/** Largest initiative magnitude: a sanity bound. A Perception roll never nears it. */
export const MAX_INITIATIVE = 1000;

/** The largest action count the schema stores: overspending is allowed (never blocked), so this is only a sanity bound. */
export const MAX_COUNTER = 99;

/**
 * What a combatant has used this turn. Reset by the server at the start of that
 * combatant's turn (`startOfTurn` in `systems/pf2e`). It lives here, not on the
 * actor: it means nothing outside a fight (ADR 0018, decision 4).
 */
export const turnStateSchema = z.object({
  /** Actions spent this turn. Allowed to exceed the turn's capacity: the app warns and never blocks (docs/action-economy.md). */
  actionsSpent: z.number().int().min(0).max(MAX_COUNTER).default(0),
  /** Whether the reaction has been used since the combatant's last turn began. */
  reactionUsed: z.boolean().default(false),
  /** Attacks made this turn; the Multiple Attack Penalty counts these, not actions. */
  attacksMade: z.number().int().min(0).max(MAX_COUNTER).default(0),
});

export type TurnState = z.infer<typeof turnStateSchema>;

export const combatantSchema = baseDocumentSchema.extend({
  type: z.literal('combatant'),
  combatId: idSchema,
  /** The token that fights. A combatant is a token on a scene, so a creature with no token cannot join. */
  tokenId: idSchema,
  actorId: idSchema,
  /** The rolled (or GM-set) initiative. Absent until rolled; an unrolled combatant sorts last. */
  initiative: z.number().int().min(-MAX_INITIATIVE).max(MAX_INITIATIVE).optional(),
  /** Out of the fight (dead, fled, left behind). Still listed for the GM; skipped by the turn order. */
  defeated: z.boolean().default(false),
  /** Whether players can see it in the order. The server derives the permissions from this, never the client. */
  hidden: z.boolean().default(false),
  turn: turnStateSchema.default({ actionsSpent: 0, reactionUsed: false, attacksMade: 0 }),
});

export type Combatant = z.infer<typeof combatantSchema>;
