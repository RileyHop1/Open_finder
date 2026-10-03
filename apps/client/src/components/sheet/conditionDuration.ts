/**
 * How a condition's duration reads in words (M5 C.7), kept apart from
 * `ConditionsPanel.vue` so the wording is testable without mounting
 * anything. `undefined` means nothing worth saying: an absent duration, or
 * `untilRemoved`, both mean "until someone removes it" (`docs/conditions.md`,
 * "Durations").
 */
import type { ConditionDuration } from '@hearthtable/pf2e';

export function describeDuration(
  duration: ConditionDuration | undefined,
  labelOf: (combatantId: string) => string | undefined,
): string | undefined {
  if (duration === undefined || duration.type === 'untilRemoved') {
    return undefined;
  }
  switch (duration.type) {
    case 'turn': {
      const label = labelOf(duration.combatantId) ?? 'an unknown combatant';
      const when = duration.boundary === 'start' ? 'the start' : 'the end';
      return `Ends at ${when} of ${label}'s turn`;
    }
    case 'rounds':
      return `${duration.remaining} round${duration.remaining === 1 ? '' : 's'} left`;
    case 'sustained':
      return 'Sustained (ends by hand)';
    case 'minutes':
    case 'hours':
    case 'days':
      return `${duration.remaining} ${duration.type} (ends by hand until the Calendar exists)`;
  }
}
