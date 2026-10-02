/**
 * Comparing how long conditions last, so two sources of one condition can keep
 * the longer-lasting one (`docs/rulings.md`, "Two sources of a condition keep the
 * longer duration"). Pure; the combat tracker's expiry is a separate concern
 * (milestone 5, A.5).
 */

import type { ConditionDuration } from '../content/conditionDuration.js';

/** Seconds in a round: the rules fix a round at 6 seconds. */
const ROUND_SECONDS = 6;

/**
 * How long a duration lasts, in seconds, for comparison only.
 *
 * - No duration, and `untilRemoved`, last forever.
 * - `turn` counts as one round: it ends within a round of being applied.
 * - `sustained` counts as a minute, the longest a sustained effect can last.
 *
 * This is a comparison scale, not a clock: nothing here ticks a duration.
 */
export function durationSeconds(duration: ConditionDuration | undefined): number {
  if (duration === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  switch (duration.type) {
    case 'untilRemoved':
      return Number.POSITIVE_INFINITY;
    case 'turn':
      return ROUND_SECONDS;
    case 'rounds':
      return duration.remaining * ROUND_SECONDS;
    case 'sustained':
      return 60;
    case 'minutes':
      return duration.remaining * 60;
    case 'hours':
      return duration.remaining * 3600;
    case 'days':
      return duration.remaining * 86_400;
  }
}

/**
 * The longer-lasting of two durations. On a tie `existing` wins, so applying the
 * same thing twice changes nothing.
 */
export function longerDuration(
  existing: ConditionDuration | undefined,
  incoming: ConditionDuration | undefined,
): ConditionDuration | undefined {
  return durationSeconds(incoming) > durationSeconds(existing) ? incoming : existing;
}
