/**
 * The ADR 0008 resolver: turns a `Modifier[]` into a `Statistic`, applying
 * PF2e's stacking rules along the way. This is the one place those rules
 * are implemented -- every AC, save, skill, and strike in `systems/pf2e`
 * calls this rather than summing modifiers itself (ADR 0008's "hardcode
 * stacking per statistic" rejected alternative).
 *
 * The stacking rules (ADR 0008):
 * - `circumstance`, `status`, and `item` are typed. Within each type, only
 *   the highest bonus (value >= 0) and the worst penalty (value < 0) apply;
 *   every other same-type, same-sign modifier is suppressed.
 * - `untyped`, `proficiency`, and `ability` always stack -- they are never
 *   suppressed by anything, including each other.
 * - A modifier that is `enabled: false`, or whose `predicate` fails against
 *   the supplied roll options, does not apply and cannot suppress or be
 *   suppressed by anything else -- it is simply not in play this
 *   resolution.
 *
 * Suppressed modifiers are never dropped from the result (ADR 0008 decision
 * 3): every input modifier appears in the output, marked `applied` and,
 * when beaten by a same-type rival, `suppressedBy` that rival's slug.
 */

import type { Modifier, ResolvedModifier, Statistic } from './modifier.js';
import { testPredicate } from './predicate.js';

/** The three bonus/penalty types PF2e's stacking rule actually applies to. */
const STACKING_TYPES = new Set(['circumstance', 'status', 'item']);

type Sign = 'bonus' | 'penalty';

function signOf(value: number): Sign {
  return value >= 0 ? 'bonus' : 'penalty';
}

/**
 * True when `challenger` should replace `incumbent` as the winner of a
 * (type, sign) group. The larger bonus wins; the more negative penalty
 * wins ("the worst of each type"). Ties are broken by slug, alphabetically
 * first winning -- an arbitrary but *deterministic* rule, so the same
 * modifier set resolves the same way regardless of input order. Golden
 * tests depend on that stability.
 */
function beats(challenger: Modifier, incumbent: Modifier, sign: Sign): boolean {
  if (challenger.value !== incumbent.value) {
    return sign === 'bonus'
      ? challenger.value > incumbent.value
      : challenger.value < incumbent.value;
  }
  return challenger.slug < incumbent.slug;
}

export interface ResolveStatisticOptions {
  /**
   * The roll options active for this resolution, tested against every
   * modifier's `predicate` (ADR 0008 decision 6). Defaults to empty, so a
   * caller with no conditional modifiers can omit it entirely.
   */
  readonly rollOptions?: ReadonlySet<string>;
}

/**
 * Resolves a full modifier list into a `Statistic`. See the module doc for
 * the stacking rules this implements.
 */
export function resolveStatistic(
  modifiers: readonly Modifier[],
  options: ResolveStatisticOptions = {},
): Statistic {
  const rollOptions = options.rollOptions ?? new Set<string>();

  const eligible = modifiers.map(
    (modifier) =>
      modifier.enabled &&
      (modifier.predicate === undefined ||
        testPredicate(modifier.predicate, rollOptions)),
  );

  // For each (type, sign) group among the stacking types, find the index of
  // the winning modifier -- the one every other eligible member of that
  // same group is suppressed by.
  const winnerIndexByGroup = new Map<string, number>();
  modifiers.forEach((modifier, index) => {
    if (!eligible[index] || !STACKING_TYPES.has(modifier.type)) {
      return;
    }
    const group = `${modifier.type}:${signOf(modifier.value)}`;
    const currentWinner = winnerIndexByGroup.get(group);
    if (
      currentWinner === undefined ||
      beats(modifier, modifiers[currentWinner]!, signOf(modifier.value))
    ) {
      winnerIndexByGroup.set(group, index);
    }
  });

  const resolved: ResolvedModifier[] = modifiers.map((modifier, index) => {
    if (!eligible[index]) {
      return { ...modifier, applied: false };
    }
    if (!STACKING_TYPES.has(modifier.type)) {
      // untyped, proficiency, ability: always stacks once eligible.
      return { ...modifier, applied: true };
    }
    const group = `${modifier.type}:${signOf(modifier.value)}`;
    const winnerIndex = winnerIndexByGroup.get(group);
    if (winnerIndex === index) {
      return { ...modifier, applied: true };
    }
    const winner = modifiers[winnerIndex!]!;
    return { ...modifier, applied: false, suppressedBy: winner.slug };
  });

  const total = resolved.reduce(
    (sum, modifier) => sum + (modifier.applied ? modifier.value : 0),
    0,
  );

  return { total, modifiers: resolved };
}
