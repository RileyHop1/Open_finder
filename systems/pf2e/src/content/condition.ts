/**
 * The `condition` content kind: the read-only *definition* every applied
 * condition instance (`docs/conditions.md`'s runtime shape -- duration,
 * source, a resolved value, milestone 3/5) is created from. This schema is
 * that definition only: is it valued or binary, what group of mutually
 * exclusive conditions it belongs to, and what it supersedes when applied.
 *
 * **Deliberate gap, not an oversight:** how a valued condition's number
 * becomes a `Modifier` (frightened 2 -> a -2 status penalty) is not modeled
 * here. The existing `flatModifier` rule element takes a fixed integer
 * `value` -- it has no way to say "scale with this condition's own current
 * value," which is inherently an actor-instance fact, not static content.
 * That mapping is milestone 3/5's condition-application logic to design,
 * not something to half-build ahead of it.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import { traitSlugSchema } from './common.js';

export const conditionEntrySchema = compendiumEntrySchema
  .extend({
    kind: z.literal('condition'),
    traits: z.array(traitSlugSchema).readonly().default([]),
    valued: z.boolean(),
    /**
     * The fixed maximum this valued condition's value cannot exceed, if
     * any. Absent for an unbounded valued condition. `dying`'s own
     * interaction with `wounded`/`doomed` (`docs/conditions.md`'s "dying
     * chain") happens at the actor level and is not this field's job.
     */
    maxValue: z.number().int().positive().optional(),
    /**
     * Conditions in the same mutually exclusive progression -- the
     * detection ladder (`observed`/`hidden`/`undetected`/`unnoticed`) is
     * the canonical example. Absent for a standalone condition.
     * **(confirm)** the exact grouping taxonomy against real upstream data
     * during the importer PR.
     */
    group: z.string().min(1).optional(),
    /**
     * Slugs of other conditions this one supersedes when applied -- e.g. a
     * higher detection state clearing a lower one. **(confirm)** against
     * real upstream data during the importer PR.
     */
    overrides: z.array(z.string().min(1)).readonly().default([]),
  })
  .refine((entry) => entry.valued || entry.maxValue === undefined, {
    message: 'maxValue only applies to a valued condition',
    path: ['maxValue'],
  });

export type ConditionEntry = z.infer<typeof conditionEntrySchema>;
