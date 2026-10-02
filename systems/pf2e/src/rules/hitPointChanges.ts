/**
 * The arithmetic of taking damage, being healed, and gaining temporary hit
 * points. Pure and whole-number: it returns the new `{ current, temp }` and
 * leaves it to the caller to store it, so the sheet's buttons and any later
 * automation (the combat tracker, milestone 5) share one set of rules.
 *
 * - **Damage** is taken from temporary hit points first, then from current hit
 *   points, which stop at 0. Going unconscious, dying, and wounded at 0 are
 *   `dyingChain.ts`'s; this only moves the numbers.
 * - **Healing** raises current hit points, never above the maximum, and does
 *   not touch temporary hit points.
 * - **Temporary hit points do not stack**: gaining some when you already have
 *   them leaves you with the larger amount, not the sum. Setting them directly
 *   (the GM's override) is a plain assignment and bypasses this.
 *
 * See `docs/rulings.md`, "Temporary hit points".
 */

export interface HitPointState {
  readonly current: number;
  readonly temp: number;
}

function wholeAmount(amount: number): number {
  return Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
}

/** `state` after taking `amount` damage. A negative or fractional amount is treated as its whole, non-negative part. */
export function applyDamage(state: HitPointState, amount: number): HitPointState {
  const damage = wholeAmount(amount);
  const absorbed = Math.min(state.temp, damage);
  return {
    current: Math.max(0, state.current - (damage - absorbed)),
    temp: state.temp - absorbed,
  };
}

/** `state` after healing `amount`, capped at `max`. Current hit points already above `max` are left alone, not lowered. */
export function applyHealing(
  state: HitPointState,
  amount: number,
  max: number,
): HitPointState {
  const healing = wholeAmount(amount);
  return {
    current: Math.max(state.current, Math.min(max, state.current + healing)),
    temp: state.temp,
  };
}

/** `state` after gaining `amount` temporary hit points: the larger of what you have and what you gain. */
export function grantTemporaryHitPoints(
  state: HitPointState,
  amount: number,
): HitPointState {
  return { current: state.current, temp: Math.max(state.temp, wholeAmount(amount)) };
}
