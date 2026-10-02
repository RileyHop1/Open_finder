/**
 * When an applied condition ends -- see `docs/conditions.md` (Durations) and
 * ADR 0018. A discriminated union on `type`, so a new kind (a GM's custom
 * effect, say) is one more member and never a change to what is already stored.
 *
 * **Absent means `untilRemoved`.** A condition written before durations existed
 * has no `duration` and keeps meaning "until someone removes it", so nothing
 * needed migrating.
 *
 * Only the combat kinds (`turn`, `rounds`) are ended by the combat tracker
 * (milestone 5). The calendar kinds (`minutes`, `hours`, `days`) are stored so a
 * GM can set them today, but **nothing expires them until the `Calendar` exists
 * (milestone 13)**: until then they end by hand, and the UI says so.
 */

import { idSchema } from '@hearthtable/core';
import { z } from 'zod';

/** A turn-count's sanity bound, not a rule: a combat does not run this long. */
const MAX_ROUNDS = 99;

/** A calendar count's sanity bound: no day, hour, or minute count should reach it. */
const MAX_CALENDAR = 9999;

export const TURN_BOUNDARIES = ['start', 'end'] as const;

export type TurnBoundary = (typeof TURN_BOUNDARIES)[number];

export const conditionDurationSchema = z.discriminatedUnion('type', [
  /** Manual only. The same as no duration at all. */
  z.object({ type: z.literal('untilRemoved') }),
  /** Until the start or the end of one combatant's turn ("until the end of your next turn"). */
  z.object({
    type: z.literal('turn'),
    combatantId: idSchema,
    boundary: z.enum(TURN_BOUNDARIES),
  }),
  /** A count of rounds that ticks down at turn boundaries ("for 3 rounds"). */
  z.object({
    type: z.literal('rounds'),
    remaining: z.number().int().min(1).max(MAX_ROUNDS),
  }),
  /** Until the caster stops sustaining it. Ended by hand until spells are automated. */
  z.object({ type: z.literal('sustained') }),
  /** Calendar time ("for 10 minutes"). Not ticked until the `Calendar` (milestone 13). */
  z.object({
    type: z.literal('minutes'),
    remaining: z.number().int().min(1).max(MAX_CALENDAR),
  }),
  z.object({
    type: z.literal('hours'),
    remaining: z.number().int().min(1).max(MAX_CALENDAR),
  }),
  z.object({
    type: z.literal('days'),
    remaining: z.number().int().min(1).max(MAX_CALENDAR),
  }),
]);

export type ConditionDuration = z.infer<typeof conditionDurationSchema>;
