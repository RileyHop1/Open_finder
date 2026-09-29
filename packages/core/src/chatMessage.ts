/**
 * ChatMessage: rolls, item cards, and plain messages -- see CLAUDE.md's
 * Architecture section. The one concrete document type built in milestone 1,
 * because "chat with a dice roll" is the thin thread's proof of the whole
 * pipeline: schema -> SQLite -> operation -> sequence -> broadcast.
 *
 * Two variants under one `kind` field, not one schema trying to cover both --
 * a plain text message and a dice roll are different enough shapes (a roll
 * has no free text, a message has no `RollResult`) that forcing them into a
 * single optional-everything schema would make neither variant's actual
 * requirements checkable. `kind` is a second-level discriminant, distinct
 * from `type`, which `baseDocumentSchema` already fixes to the literal
 * `'chatMessage'` -- see docs/documents.md.
 *
 * The roll schema mirrors `@hearthtable/dice`'s own `RollResult` field for
 * field, per that package's and CLAUDE.md's shared rule: a ChatMessage stores
 * the structured result, never a rendered string, so the hoverable
 * combat-log breakdown in the north star has real data to read from later.
 * `DEGREES_OF_SUCCESS` is imported rather than re-listed, so the literal set
 * can't drift between the two packages. The match is also checked against a
 * real roll in `chatMessage.test.ts`, not just assumed from reading the
 * source.
 *
 * Imports from `@hearthtable/dice/pure`, not the package root: the root also
 * exports `cryptoRandomSource`, which needs `node:crypto` and would pull
 * Node's types into this package's typecheck -- `packages/core` is
 * isomorphic (shared with `apps/client`) and must not require them. See
 * `packages/dice/src/pure.ts`.
 */

import type { DamageByType, DegreeOfSuccess, RollTerm } from '@hearthtable/dice/pure';
import { DEGREES_OF_SUCCESS } from '@hearthtable/dice/pure';
import { z } from 'zod';

import { baseDocumentSchema } from './document.js';
import { idSchema } from './record.js';

const dieTermSchema = z.object({
  kind: z.literal('die'),
  faces: z.number().int().positive(),
  result: z.number().int().positive(),
  kept: z.boolean(),
  value: z.number().int(),
});

const constantTermSchema = z.object({
  kind: z.literal('constant'),
  value: z.number().int(),
});

const referenceTermSchema = z.object({
  kind: z.literal('reference'),
  name: z.string().min(1),
  value: z.number().int(),
});

/**
 * Mirrors `@hearthtable/dice`'s `RollTerm` union. The `z.ZodType<RollTerm>`
 * annotation is deliberate, not decorative: it makes this schema's inferred
 * output type fail to compile if it ever stops structurally matching that
 * package's own type, catching drift here rather than only at the
 * `chatMessage.test.ts` roll fixture.
 */
export const rollTermSchema: z.ZodType<RollTerm> = z.discriminatedUnion('kind', [
  dieTermSchema,
  constantTermSchema,
  referenceTermSchema,
]);

/** Mirrors `@hearthtable/dice`'s `DegreeOfSuccess` -- reuses its literal list rather than a second copy of it. */
export const degreeOfSuccessSchema: z.ZodType<DegreeOfSuccess> =
  z.enum(DEGREES_OF_SUCCESS);

/** Mirrors `@hearthtable/dice`'s `DamageByType` -- an open record, since this package doesn't know any system's damage type list either. */
export const damageByTypeSchema: z.ZodType<DamageByType> = z.record(
  z.string(),
  z.number(),
);

/**
 * Mirrors `@hearthtable/dice`'s `RollResult` -- see docs/dice.md, "Return
 * shape". Not annotated `z.ZodType<RollResult>` the way the schemas above
 * are: `RollResult`'s optional fields are plain `field?: T`, but
 * `exactOptionalPropertyTypes` makes every Zod `.optional()` infer as
 * `field?: T | undefined` -- a real, known Zod limitation, not a shape
 * mismatch to fix here. `chatMessage.test.ts` proves the match empirically
 * instead, against real `@hearthtable/dice` output.
 */
export const rollResultSchema = z.object({
  expression: z.string().min(1),
  total: z.number().int(),
  terms: z.array(rollTermSchema),
  degree: degreeOfSuccessSchema.optional(),
  natural: z.number().int().optional(),
  damage: damageByTypeSchema.optional(),
  seed: z.string().optional(),
});

const chatMessageBaseSchema = baseDocumentSchema.extend({
  type: z.literal('chatMessage'),
  /**
   * The seat that sent this message. Required, not optional: a connection
   * can't send a `chat.*` operation at all until it has claimed a seat (see
   * `apps/server/src/realtime.ts`'s dispatch pipeline), so a ChatMessage with
   * no sender is not a state that can actually arise.
   */
  seatId: idSchema,
});

export const chatTextMessageSchema = chatMessageBaseSchema.extend({
  kind: z.literal('text'),
  text: z.string().min(1),
});

export type ChatTextMessage = z.infer<typeof chatTextMessageSchema>;

export const chatRollMessageSchema = chatMessageBaseSchema.extend({
  kind: z.literal('roll'),
  roll: rollResultSchema,
});

export type ChatRollMessage = z.infer<typeof chatRollMessageSchema>;

/** Every shape a `ChatMessage` document can take. */
export const chatMessageSchema = z.discriminatedUnion('kind', [
  chatTextMessageSchema,
  chatRollMessageSchema,
]);

export type ChatMessage = z.infer<typeof chatMessageSchema>;
