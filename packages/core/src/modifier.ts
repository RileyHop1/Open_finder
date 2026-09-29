/**
 * Modifier and Statistic: the shapes ADR 0008's resolver consumes and
 * produces. This module is shapes only -- no stacking logic, no resolution.
 * The resolver itself (`resolveStatistic`, a later module) is the only
 * thing that turns a `Modifier[]` into a `Statistic`; see ADR 0008 for why
 * those two responsibilities are kept in one place rather than a bare-total
 * function plus a separate explanation-builder.
 */

import { z } from 'zod';

import { predicateSchema } from './predicate.js';

/**
 * PF2e's stacking types (ADR 0008): `circumstance`/`status`/`item` bonuses
 * and penalties each suppress all but the best of their own type;
 * `untyped` always stacks; `proficiency` and `ability` are not bonus types
 * at all but are modeled the same way so the resolver has one input shape
 * for everything that contributes to a total.
 */
export const MODIFIER_TYPES = [
  'circumstance',
  'status',
  'item',
  'untyped',
  'proficiency',
  'ability',
] as const;

export type ModifierType = (typeof MODIFIER_TYPES)[number];

export const modifierTypeSchema = z.enum(MODIFIER_TYPES);

/**
 * One contribution to a statistic, before stacking is resolved. `source`
 * names the item, feat, condition, or spell it came from -- required, not
 * optional, because "why is this here" is exactly what the breakdown UI
 * (ADR 0008, "show the math") exists to answer, and an unsourced modifier
 * can't answer it. `predicate` is absent for an unconditional modifier;
 * present, it is tested against the roll options active at resolution time
 * (ADR 0008 decision 6). `enabled` lets a modifier be turned off without
 * removing it -- the GM override path CLAUDE.md requires alongside every
 * piece of automation.
 */
export const modifierSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  type: modifierTypeSchema,
  value: z.number().int(),
  source: z.string().min(1),
  predicate: predicateSchema.optional(),
  enabled: z.boolean(),
});

export type Modifier = z.infer<typeof modifierSchema>;

/**
 * A `Modifier` after resolution: the original fields, plus whether it
 * actually applied. `suppressedBy` names the slug of the modifier that beat
 * it -- present only when `applied` is false because of stacking (a
 * disabled or predicate-failed modifier is also `applied: false`, but has
 * no `suppressedBy`, since nothing "beat" it). Suppressed modifiers are
 * retained rather than filtered out (ADR 0008 decision 3): they are the
 * answer to "why isn't my bonus showing up."
 */
export const resolvedModifierSchema = modifierSchema.extend({
  applied: z.boolean(),
  suppressedBy: z.string().min(1).optional(),
});

export type ResolvedModifier = z.infer<typeof resolvedModifierSchema>;

/**
 * The result of resolving a full set of modifiers: a total, and the
 * complete modifier list with each entry marked applied or suppressed.
 * There is no bare-total variant of this type anywhere in the codebase, on
 * purpose -- see ADR 0008's "no second code path" decision. Every number
 * the sheet displays is a `Statistic`, never a plain number with the
 * explanation reconstructed separately.
 */
export const statisticSchema = z.object({
  total: z.number().int(),
  modifiers: z.array(resolvedModifierSchema).readonly(),
});

export type Statistic = z.infer<typeof statisticSchema>;
