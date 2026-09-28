/**
 * The PF2e degree-of-success table: compares a roll's total to a DC, then
 * applies the natural-20/natural-1 shift.
 *
 * Kept in its own module, separate from the rest of this otherwise
 * system-agnostic package, because "a natural 20 on a d20 shifts the
 * result" is PF2e-specific knowledge, not general dice arithmetic -- see
 * docs/dice.md, "Scope". `evaluate()` does not call this module and never
 * will; a future non-d20 system plugin can simply never import it either.
 * Wiring this into a real check-rolling flow is the job of whatever system
 * layer calls both `evaluate()` and `degreeOfSuccess()`.
 */

import { DEGREES_OF_SUCCESS, type DegreeOfSuccess } from './types.js';

/**
 * Determines the degree of success for `total` against `dc`, then shifts it
 * one step if `natural` is 20 (up) or 1 (down), clamping at either end of
 * the four-value scale.
 *
 * Order matters: the shift is applied AFTER comparing `total` to `dc`, never
 * before. A natural 20 that still falls short of the DC is a success, not a
 * critical success; a natural 1 on a total that already beat DC+10 is a
 * success, not a critical failure. Applying the shift first is the classic
 * bug this ordering exists to prevent -- see docs/dice.md, "Degrees of
 * success", which names both of those cases explicitly.
 */
export function degreeOfSuccess(
  total: number,
  dc: number,
  natural: number,
): DegreeOfSuccess {
  const base = baseDegree(total, dc);
  const shift = natural === 20 ? 1 : natural === 1 ? -1 : 0;
  return shiftDegree(base, shift);
}

function baseDegree(total: number, dc: number): DegreeOfSuccess {
  if (total >= dc + 10) {
    return 'criticalSuccess';
  }
  if (total >= dc) {
    return 'success';
  }
  if (total <= dc - 10) {
    return 'criticalFailure';
  }
  return 'failure';
}

function shiftDegree(degree: DegreeOfSuccess, shift: -1 | 0 | 1): DegreeOfSuccess {
  // DEGREES_OF_SUCCESS is ordered worst to last (see types.ts) specifically
  // so this shift is index arithmetic, clamped to the array's own bounds.
  const index = DEGREES_OF_SUCCESS.indexOf(degree);
  const clamped = Math.min(DEGREES_OF_SUCCESS.length - 1, Math.max(0, index + shift));
  const shifted = DEGREES_OF_SUCCESS[clamped];
  if (shifted === undefined) {
    // Unreachable: `clamped` is always within [0, length - 1] above.
    throw new Error('internal error: degree shift produced an out-of-range index');
  }
  return shifted;
}
