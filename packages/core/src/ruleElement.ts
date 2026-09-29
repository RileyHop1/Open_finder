/**
 * Rule elements: data-driven automation attached to a compendium entry --
 * "a feat that grants +1 to Athletics is data, not code" (ADR 0004). This is
 * **our own schema**, informed by upstream's design but not copying its
 * shape or its ~40 element types; see ADR 0004 decision 1. The importer is
 * the only module in the repository that knows Foundry's rule-element
 * format exists (decision 3) -- nothing here, and nothing downstream of
 * here, does.
 *
 * v1 supports exactly five kinds (ADR 0004 decision 2), chosen to cover what
 * a real table hits most turns:
 * - **flatModifier** -- a typed bonus or penalty to a statistic
 * - **damageDice** -- extra (or replacement) damage dice on a strike or spell
 * - **rollOption** -- a tag other elements' predicates can test
 * - **grantItem** -- this item also grants another compendium entry
 * - **choiceSet** -- the player picks one of several options, recorded as a
 *   roll option so the choice can drive other elements' predicates
 *
 * Everything else -- an upstream element type we don't map, or a supported
 * kind used in a way our subset can't represent (a formula-valued
 * `FlatModifier`, a predicate needing an operator `predicate.ts` doesn't
 * support) -- becomes **`inert`**. An inert element is never dropped (ADR
 * 0004 decision 4): the item that carries it still imports, with its rules
 * text intact, and the sheet marks it "automation not applied" so the GM can
 * apply it by hand. `InertRuleElement` deliberately carries no upstream
 * payload -- retaining one would be exactly the leak decision 3 forbids, and
 * `reason` is enough for the coverage report (decision 5) to explain what
 * happened without smuggling Foundry's format past the importer.
 */

import { z } from 'zod';

import { modifierTypeSchema } from './modifier.js';
import { predicateSchema } from './predicate.js';

/**
 * A flat, typed bonus or penalty to a statistic. `selector` names which
 * statistic it targets (`'ac'`, `'perception'`, `'skill:acrobatics'`, a
 * strike's slug, ...) -- `systems/pf2e`'s rules math owns the actual set of
 * valid selectors, not this package, the same way `type` on a document stays
 * an open string at the envelope level. `value` is a plain integer: a
 * formula-valued upstream modifier (`@actor.level`, and similar) has no
 * representation in v1 and imports `inert` instead (see the module doc and
 * ADR 0004 decision 4's "unmapped... imports inert" applied to a supported
 * kind used unsupportedly).
 */
export const flatModifierElementSchema = z.object({
  kind: z.literal('flatModifier'),
  selector: z.string().min(1),
  slug: z.string().min(1).optional(),
  label: z.string().min(1),
  type: modifierTypeSchema,
  value: z.number().int(),
  predicate: predicateSchema.optional(),
});

export type FlatModifierElement = z.infer<typeof flatModifierElementSchema>;

/** The die sizes PF2e actually uses. Not `z.number()` -- an invalid die size should fail at import time, not at roll time. */
export const DAMAGE_DICE_FACES = [4, 6, 8, 10, 12] as const;

export const damageDiceFacesSchema = z.union([
  z.literal(4),
  z.literal(6),
  z.literal(8),
  z.literal(10),
  z.literal(12),
]);

/**
 * Extra damage dice on a strike or spell. `damageType` is absent when the
 * added dice take the base attack's own damage type (the common case, e.g.
 * a rogue's sneak attack dice); present, it overrides it (e.g. a flaming
 * rune's fire damage).
 */
export const damageDiceElementSchema = z.object({
  kind: z.literal('damageDice'),
  selector: z.string().min(1),
  diceNumber: z.number().int().positive(),
  dieFaces: damageDiceFacesSchema,
  damageType: z.string().min(1).optional(),
  predicate: predicateSchema.optional(),
});

export type DamageDiceElement = z.infer<typeof damageDiceElementSchema>;

/**
 * Adds `option` to the active roll-options set, optionally gated by its own
 * predicate. Roll options are how other elements' predicates observe traits,
 * conditions, and choices -- `docs/modifiers.md`'s "Predicate" section is the
 * consumer side of this.
 */
export const rollOptionElementSchema = z.object({
  kind: z.literal('rollOption'),
  option: z.string().min(1),
  predicate: predicateSchema.optional(),
});

export type RollOptionElement = z.infer<typeof rollOptionElementSchema>;

/**
 * This item also grants another compendium entry. The target is identified
 * by `packId` + `slug` -- our own post-import identity, not an upstream
 * UUID -- because resolving "which of our entries does this upstream
 * reference correspond to" is exactly the kind of Foundry-format knowledge
 * that stays confined to the importer (ADR 0004 decision 3). By the time a
 * `GrantItemElement` exists, that resolution has already happened; if it
 * can't be resolved (the target was excluded -- ADR 0003 decision 5), the
 * whole entry is dropped rather than the reference silently stripped.
 */
export const grantItemElementSchema = z.object({
  kind: z.literal('grantItem'),
  packId: z.string().min(1),
  slug: z.string().min(1),
});

export type GrantItemElement = z.infer<typeof grantItemElementSchema>;

export const choiceOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

export type ChoiceOption = z.infer<typeof choiceOptionSchema>;

/**
 * Asks the player to pick one of `choices`. The chosen value is recorded as
 * the roll option `${rollOptionPrefix}:${value}` -- e.g. a bloodline choice
 * of `draconic` under prefix `bloodline` becomes the roll option
 * `bloodline:draconic` -- so the choice can drive other elements' predicates
 * exactly like `rollOption` does.
 */
export const choiceSetElementSchema = z.object({
  kind: z.literal('choiceSet'),
  prompt: z.string().min(1),
  choices: z.array(choiceOptionSchema).min(1),
  rollOptionPrefix: z.string().min(1),
});

export type ChoiceSetElement = z.infer<typeof choiceSetElementSchema>;

/**
 * Everything ADR 0004's v1 subset does not cover. See the module doc for why
 * this carries a `reason` and nothing else.
 */
export const inertRuleElementSchema = z.object({
  kind: z.literal('inert'),
  upstreamKind: z.string().min(1),
  reason: z.string().min(1),
});

export type InertRuleElement = z.infer<typeof inertRuleElementSchema>;

/** Every shape a rule element can take. See the module doc. */
export const ruleElementSchema = z.discriminatedUnion('kind', [
  flatModifierElementSchema,
  damageDiceElementSchema,
  rollOptionElementSchema,
  grantItemElementSchema,
  choiceSetElementSchema,
  inertRuleElementSchema,
]);

export type RuleElement = z.infer<typeof ruleElementSchema>;
