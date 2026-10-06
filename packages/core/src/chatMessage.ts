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
import { statisticSchema } from './modifier.js';
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
  // .readonly() matches RollResult.terms's own `readonly RollTerm[]` --
  // without it, Zod infers a mutable array and a real RollResult (which IS
  // readonly) fails to assign to this schema's inferred type.
  terms: z.array(rollTermSchema).readonly(),
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
  /** The GM's override of this roll's total ("GM set to N (rolled M)" on the card, `docs/dice.md`). `roll` itself is untouched: every term, and its own `total`, stay exactly as rolled. `chat.adjustRoll`, GM only. */
  gmTotal: z.number().int().optional(),
});

export type ChatRollMessage = z.infer<typeof chatRollMessageSchema>;

/**
 * A check rolled from a character sheet (a skill, a save, Perception). It
 * stores the roll *and* the statistic it was made with -- every modifier,
 * applied or suppressed -- so the hover breakdown (milestone 6) is a view over
 * this message and not a recomputation that could disagree with what was
 * rolled. `actorName` and `label` are snapshots, so history still reads
 * correctly after the character is renamed or deleted.
 */
export const chatCheckMessageSchema = chatMessageBaseSchema.extend({
  kind: z.literal('check'),
  actorId: idSchema,
  actorName: z.string().min(1),
  /** The statistic rolled, keyed as the sheet keys it: `perception`, `fortitude`, `skill:athletics`. */
  statistic: z.string().min(1),
  /** The statistic's display name, e.g. `Athletics`. */
  label: z.string().min(1),
  /** The DC rolled against, if the roller named one. */
  dc: z.number().int().optional(),
  /** The statistic as resolved when the roll was made. */
  breakdown: statisticSchema,
  roll: rollResultSchema,
  /** The GM's override of this roll's total ("GM set to N (rolled M)" on the card, `docs/dice.md`). `roll` itself is untouched, and `degree` is recomputed against `dc` from the new total. `chat.adjustRoll`, GM only. */
  gmTotal: z.number().int().optional(),
});

export type ChatCheckMessage = z.infer<typeof chatCheckMessageSchema>;

const chatStrikeBaseSchema = chatMessageBaseSchema.extend({
  actorId: idSchema,
  actorName: z.string().min(1),
  /**
   * What struck, and its name as a snapshot: a character's carried weapon by
   * item id, or a monster's strike by its key (`strike:<name>`), which has no
   * item. Exactly one is set.
   */
  itemId: idSchema.optional(),
  strikeKey: z.string().min(1).max(100).optional(),
  weaponName: z.string().min(1),
});

/**
 * A strike's attack roll. `breakdown` is the attack bonus used, already
 * including the Multiple Attack Penalty for `attackNumber`, so the penalty
 * shows up as a modifier line like any other.
 */
export const chatStrikeAttackMessageSchema = chatStrikeBaseSchema.extend({
  kind: z.literal('strikeAttack'),
  attackNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  dc: z.number().int().optional(),
  /**
   * The token struck, and the name it was struck as. Only recorded when the target
   * is visible to the whole table, so a card never reveals a hidden creature; the
   * degree of success on `roll` is shown either way.
   */
  targetTokenId: idSchema.optional(),
  targetName: z.string().min(1).optional(),
  /**
   * The attacker was flanking the target, so the target was off-guard and `dc` is
   * two lower (docs/grid.md, "Flanking"). Only set when flanking changed the DC.
   */
  flanking: z.boolean().optional(),
  breakdown: statisticSchema,
  roll: rollResultSchema,
  /** The GM's override of this roll's total ("GM set to N (rolled M)" on the card, `docs/dice.md`). `roll` itself is untouched, and `degree` is recomputed against `dc` from the new total. `chat.adjustRoll`, GM only. */
  gmTotal: z.number().int().optional(),
});

export type ChatStrikeAttackMessage = z.infer<typeof chatStrikeAttackMessageSchema>;

/**
 * A strike's damage roll. `roll.damage` holds the total per damage type;
 * `breakdown` is the flat damage modifier added to the weapon's dice, with
 * each source named.
 */
export const chatStrikeDamageMessageSchema = chatStrikeBaseSchema.extend({
  kind: z.literal('strikeDamage'),
  critical: z.boolean(),
  breakdown: statisticSchema,
  roll: rollResultSchema,
  /** The GM's override of this roll's total ("GM set to N (rolled M)" on the card, `docs/dice.md`). `roll` itself is untouched -- a strike's damage has no degree to recompute. `chat.adjustRoll`, GM only. */
  gmTotal: z.number().int().optional(),
});

export type ChatStrikeDamageMessage = z.infer<typeof chatStrikeDamageMessageSchema>;

/**
 * Using a consumable (`actor.useItem`, ADR 0021). `itemName` and `text` are
 * snapshots of the item at the moment it was used, so the card still reads
 * correctly after the item is fully consumed and removed from the sheet.
 * `roll` is present only when `text` contained a dice expression -- using a
 * consumable is not a new kind of roll, just a new trigger for one
 * (`docs/inventory.md`).
 */
export const chatItemUseMessageSchema = chatMessageBaseSchema.extend({
  kind: z.literal('itemUse'),
  actorId: idSchema,
  actorName: z.string().min(1),
  itemName: z.string().min(1),
  text: z.string(),
  roll: rollResultSchema.optional(),
});

export type ChatItemUseMessage = z.infer<typeof chatItemUseMessageSchema>;

/** Every shape a `ChatMessage` document can take. */
export const chatMessageSchema = z.discriminatedUnion('kind', [
  chatTextMessageSchema,
  chatRollMessageSchema,
  chatCheckMessageSchema,
  chatStrikeAttackMessageSchema,
  chatStrikeDamageMessageSchema,
  chatItemUseMessageSchema,
]);

export type ChatMessage = z.infer<typeof chatMessageSchema>;
