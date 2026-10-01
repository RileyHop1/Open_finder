/**
 * Rolling a check against an already-resolved `Statistic`: `1d20` plus its
 * total, and, when there is a DC to compare against, the degree of success.
 * The same wiring `rollStrikeAttack` does for a strike, for the statistics
 * that are just a number to add (Perception, saves, skills).
 *
 * The expression is always a plain `1d20` plus an integer constant, so a
 * `parse`/`evaluate` failure here is an internal bug rather than a
 * reportable error: nothing in it is user input.
 */

import type { Statistic } from '@hearthtable/core';
import type {
  DegreeOfSuccess,
  DieTerm,
  RandomSource,
  RollResult,
} from '@hearthtable/dice/pure';
import { degreeOfSuccess, evaluate, parse } from '@hearthtable/dice/pure';

export interface RollCheckOptions {
  /** The bonus rolled: its `total` is added to the d20. */
  readonly statistic: Statistic;
  /** The DC to compare against. Absent for a roll with no target, which gets no degree. */
  readonly dc?: number;
  /** Pass `cryptoRandomSource` in production; tests pass a seeded or scripted source. */
  readonly rng: RandomSource;
}

/**
 * A rolled check. `roll` carries `natural` (the d20 face) always, and
 * `degree` only when a DC was given, so it can be stored as a chat roll as-is.
 */
export interface CheckRoll {
  readonly roll: RollResult;
  readonly degree?: DegreeOfSuccess;
}

/** Rolls `1d20 + statistic.total`, resolving a degree of success if `dc` is given. */
export function rollCheck(options: RollCheckOptions): CheckRoll {
  const { total } = options.statistic;
  const expression = total >= 0 ? `1d20+${total}` : `1d20${total}`;

  const parsed = parse(expression);
  if (!parsed.ok) {
    throw new Error(`internal error: failed to parse generated check "${expression}"`);
  }
  const evaluated = evaluate(expression, parsed.expression, { rng: options.rng });
  if (!evaluated.ok) {
    throw new Error(`internal error: failed to evaluate generated check "${expression}"`);
  }

  const die = evaluated.result.terms.find(
    (term): term is DieTerm => term.kind === 'die' && term.faces === 20,
  );
  if (die === undefined) {
    throw new Error('internal error: check roll produced no natural d20 term');
  }

  const degree =
    options.dc === undefined
      ? undefined
      : degreeOfSuccess(evaluated.result.total, options.dc, die.result);
  return {
    roll: {
      ...evaluated.result,
      natural: die.result,
      ...(degree === undefined ? {} : { degree }),
    },
    ...(degree === undefined ? {} : { degree }),
  };
}
