/**
 * The client-to-server operation vocabulary and the server's broadcast
 * envelope -- see ADR 0005, "Concurrency: operation log, authoritative
 * server". Only the operations this milestone's lobby and chat actually
 * need are defined here (`seat.claim`, `seat.release`, `chat.sendMessage`,
 * `chat.sendRoll`); the vocabulary grows per slice as later milestones need
 * more, per CLAUDE.md's Development order section.
 */

import { z } from 'zod';

import { actorKindSchema } from './actor.js';
import { baseDocumentSchema } from './document.js';
import { idSchema, timestampSchema } from './record.js';
import { seatSchema } from './seat.js';

/**
 * What a client actually sends over the wire: an intent (`type`) and its
 * data (`payload`). `id` is client-generated so a retried send can be
 * deduplicated -- see ADR 0005.
 *
 * Deliberately has no `worldId` or `seatId`. Both are facts the server
 * already knows from the connection itself -- which world's room this
 * socket joined, and which seat (if any) this connection has claimed -- and
 * must derive itself rather than trust a client-supplied value for.
 * ADR 0005's server-authoritative model means identity comes from the
 * connection, never from the payload; a client that could self-report its
 * own seatId could claim to be someone it isn't.
 */
export const clientOperationSchema = z.object({
  id: idSchema,
  type: z.string().min(1),
  payload: z.unknown(),
});

export type ClientOperation = z.infer<typeof clientOperationSchema>;

/**
 * The full record after the server processes a `ClientOperation`: identity
 * filled in from the connection (`worldId` always; `seatId` only once the
 * connection has claimed a seat -- absent for the `seat.claim` that does the
 * claiming), `sequence` assigned by the operations table, `appliedAt`
 * stamped at apply time. This is what gets persisted and what gets
 * broadcast (see `broadcastSchema` below).
 */
export const appliedOperationSchema = z.object({
  id: idSchema,
  worldId: idSchema,
  seatId: idSchema.optional(),
  type: z.string().min(1),
  payload: z.unknown(),
  sequence: z.number().int().positive(),
  appliedAt: timestampSchema,
});

export type AppliedOperation = z.infer<typeof appliedOperationSchema>;

/**
 * Claim a seat -- see ADR 0007. No envelope-level `seatId` is expected on
 * this operation's *applied* form in the common case: a connection sending
 * this usually doesn't hold a seat yet. A connection that already holds a
 * different seat may also send this to switch directly; the handler
 * auto-releases the old seat rather than requiring a separate
 * `seat.release` first, matching "click a character, unclick if wrong."
 *
 * `pin` is optional and only checked when the target seat has one set
 * (Seat's own `pin` field -- see `seat.ts`). It is not a secret and this is
 * not authentication; it exists only to stop an accidental GM-seat claim,
 * per ADR 0007 and Seat's own TSDoc.
 */
export const seatClaimOperationSchema = clientOperationSchema.extend({
  type: z.literal('seat.claim'),
  payload: z.object({ seatId: idSchema, pin: z.string().optional() }),
});

/**
 * Release the seat *this connection* currently holds. No payload target --
 * releasing is inherently self-referential, and the server already knows
 * which seat that is from the connection's own applied `seatId`.
 */
export const seatReleaseOperationSchema = clientOperationSchema.extend({
  type: z.literal('seat.release'),
  payload: z.object({}),
});

/** Post a plain chat message. */
export const chatSendMessageOperationSchema = clientOperationSchema.extend({
  type: z.literal('chat.sendMessage'),
  payload: z.object({ text: z.string().min(1) }),
});

/**
 * Request a dice roll. The payload carries the raw expression text the
 * player typed (e.g. `"1d20+7"`); the server -- never the client -- parses
 * and evaluates it with `@hearthtable/dice`, per that package's "the server
 * rolls" rule. The resulting `ChatMessage` stores the structured
 * `RollResult`, never a rendered string, per CLAUDE.md's ChatMessage rule.
 */
export const chatSendRollOperationSchema = clientOperationSchema.extend({
  type: z.literal('chat.sendRoll'),
  payload: z.object({ expression: z.string().min(1) }),
});

/**
 * Create an actor. The creating seat becomes its `owner` and everyone else at
 * the table can see it (`observer`); the GM can change either afterwards. The
 * payload carries only a kind and a name: the server builds the system data
 * itself (blank, ready to hand-build) and never trusts one from a client.
 */
export const actorCreateOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.create'),
  payload: z.object({
    kind: actorKindSchema,
    name: z.string().trim().min(1).max(100),
  }),
});

/** Delete an actor. Only its owners (and the GM, who always owns) may. */
export const actorDeleteOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.delete'),
  payload: z.object({ actorId: idSchema }),
});

/** The most field changes one `actor.update` may carry. */
export const MAX_ACTOR_CHANGES = 50;

/**
 * Change fields of an actor. `changes` maps a dotted path to its new value,
 * for example `{ "system.attributes.str": 4, "name": "Valeria" }`. Paths, not
 * a whole document, so two players editing different fields never overwrite
 * each other (ADR 0005: last write wins *per field*). A `null` value removes
 * the field. The server decides which paths are editable and re-validates the
 * whole actor afterwards; this schema only bounds the shape.
 */
export const actorUpdateOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.update'),
  payload: z.object({
    actorId: idSchema,
    changes: z
      .record(z.string().min(1), z.unknown())
      .refine((changes) => Object.keys(changes).length > 0, {
        message: 'changes must name at least one field',
      })
      .refine((changes) => Object.keys(changes).length <= MAX_ACTOR_CHANGES, {
        message: `changes may name at most ${String(MAX_ACTOR_CHANGES)} fields`,
      }),
  }),
});

/** The most of one item a stack may hold. A sanity bound, not a rule. */
export const MAX_ITEM_QUANTITY = 9999;

/**
 * Add a compendium entry to a character as a new item. The payload names the
 * entry (`packId` and `slug`) and nothing else: the server looks it up in its
 * own compendium and copies it, so a client can never supply item stats. See
 * ADR 0014.
 */
export const actorAddItemOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.addItem'),
  payload: z.object({
    actorId: idSchema,
    packId: z.string().min(1).max(100),
    slug: z.string().min(1).max(200),
  }),
});

/**
 * Change an item's `equipped` flag or `quantity`. Those are the only two
 * fields a client may change on an embedded item; the item's content is the
 * server's copy of the compendium entry and stays as it was.
 */
export const actorUpdateItemOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.updateItem'),
  payload: z
    .object({
      actorId: idSchema,
      itemId: idSchema,
      equipped: z.boolean().optional(),
      quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY).optional(),
    })
    .refine(
      (payload) => payload.equipped !== undefined || payload.quantity !== undefined,
      {
        message: 'name at least one of equipped or quantity',
      },
    ),
});

/** Remove an item from a character. */
export const actorRemoveItemOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.removeItem'),
  payload: z.object({ actorId: idSchema, itemId: idSchema }),
});

/** A condition slug: lowercase kebab-case, the same shape a trait slug has. */
const conditionSlugSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase kebab-case slug');

/** The largest condition value a payload may carry. A sanity bound; each condition's own maximum is the server's. */
export const MAX_CONDITION_VALUE = 99;

/**
 * Apply a condition to a character the ordinary way: a second source of a
 * valued condition keeps the *higher* value, never the sum, and the condition
 * clears whatever it supersedes. `value` is for valued conditions and is
 * ignored for a binary one.
 */
export const actorAddConditionOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.addCondition'),
  payload: z.object({
    actorId: idSchema,
    slug: conditionSlugSchema,
    value: z.number().int().min(1).max(MAX_CONDITION_VALUE).optional(),
  }),
});

/**
 * Set a condition to exactly this value: the manual override CLAUDE.md
 * requires beside every automated change. Unlike `actor.addCondition` it can
 * lower a value, and a `value` of 0 removes the condition.
 */
export const actorSetConditionOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.setCondition'),
  payload: z.object({
    actorId: idSchema,
    slug: conditionSlugSchema,
    value: z.number().int().min(0).max(MAX_CONDITION_VALUE).optional(),
  }),
});

/** Remove a condition from a character. */
export const actorRemoveConditionOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.removeCondition'),
  payload: z.object({ actorId: idSchema, slug: conditionSlugSchema }),
});

/** The largest DC a roll payload may carry: a sanity bound, as for conditions. */
export const MAX_ROLL_DC = 99;

/**
 * Roll a check from a character's sheet: the server resolves the statistic
 * (`perception`, a save, or `skill:<slug>`), rolls the d20, and posts a
 * structured `check` chat message. `dc`, when given, adds a degree of
 * success. Owner or GM only.
 */
export const actorRollCheckOperationSchema = clientOperationSchema.extend({
  type: z.literal('actor.rollCheck'),
  payload: z.object({
    actorId: idSchema,
    statistic: z.string().min(1).max(80),
    dc: z.number().int().min(0).max(MAX_ROLL_DC).optional(),
  }),
});

/** Add an actor to the party (created on first use). GM only. */
export const partyAddMemberOperationSchema = clientOperationSchema.extend({
  type: z.literal('party.addMember'),
  payload: z.object({ actorId: idSchema }),
});

/** Take an actor out of the party. GM only; not an error if it was not a member. */
export const partyRemoveMemberOperationSchema = clientOperationSchema.extend({
  type: z.literal('party.removeMember'),
  payload: z.object({ actorId: idSchema }),
});

/**
 * Set the party's display order. `memberIds` must list exactly the current
 * members, each once; the server rejects anything else so a stale client
 * cannot silently add or drop someone by reordering. GM only.
 */
export const partyReorderOperationSchema = clientOperationSchema.extend({
  type: z.literal('party.reorder'),
  payload: z.object({ memberIds: z.array(idSchema) }),
});

/**
 * Every operation type a client may currently send. The server validates
 * an incoming message against this union before doing anything else with
 * it (ADR 0005, step one of "validate, apply, sequence, broadcast"). New
 * operation types join this union as later milestones add the features
 * that need them -- never speculatively ahead of a real caller.
 */
export const clientOperationUnionSchema = z.discriminatedUnion('type', [
  seatClaimOperationSchema,
  seatReleaseOperationSchema,
  chatSendMessageOperationSchema,
  chatSendRollOperationSchema,
  actorCreateOperationSchema,
  actorDeleteOperationSchema,
  actorUpdateOperationSchema,
  actorAddItemOperationSchema,
  actorUpdateItemOperationSchema,
  actorRemoveItemOperationSchema,
  actorAddConditionOperationSchema,
  actorSetConditionOperationSchema,
  actorRollCheckOperationSchema,
  partyAddMemberOperationSchema,
  partyRemoveMemberOperationSchema,
  partyReorderOperationSchema,
  actorRemoveConditionOperationSchema,
]);

export type AnyClientOperation = z.infer<typeof clientOperationUnionSchema>;

/**
 * What the server sends to every connected client after applying an
 * operation: the sequence number, the applied operation itself, the
 * documents that changed, and the seats that changed -- never a diff
 * format. This is the simplest shape that satisfies ADR 0005; a diff format
 * is exactly the kind of speculative complexity CLAUDE.md's Development
 * order section warns against building ahead of a real need for it.
 *
 * `documents` validates against the shared envelope in **loose** mode
 * (`.loose()`, not the default), which matters: Zod's default `z.object()`
 * silently *strips* unknown keys on parse, verified directly against this
 * project's Zod version before choosing this. A concrete document (e.g. a
 * future Party's `memberIds`) validated through the plain base schema would
 * lose its own fields on the way through this envelope. `.loose()` checks
 * the shared fields and passes everything else through unchanged -- full
 * type-specific validation already happened when the document was created
 * or updated against its own concrete schema, so this envelope only needs
 * to confirm "at least a document," not re-validate everything.
 *
 * `seats` is separate from `documents` because a `Seat` isn't one (`seat.ts`
 * doesn't extend `baseDocumentSchema` -- see `docs/world-and-seats.md`), so
 * it validates fully against `seatSchema` rather than needing the same
 * loose-mode treatment; there's no concrete-subtype-losing-fields problem
 * here since `Seat` has no subtypes.
 */
export const broadcastSchema = z.object({
  sequence: z.number().int().positive(),
  operation: appliedOperationSchema,
  documents: z.array(baseDocumentSchema.loose()),
  /**
   * Documents this operation deleted, as bare envelopes (not loose: the
   * type-specific body is stripped on purpose, so a deletion never re-sends
   * what was removed). Carries the permissions so each viewer is told only
   * about deletions of documents they could read.
   */
  deleted: z.array(baseDocumentSchema).default([]),
  seats: z.array(seatSchema),
});

export type Broadcast = z.infer<typeof broadcastSchema>;
