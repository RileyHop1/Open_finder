/**
 * The dying chain: what happens when a character is dropped to 0 hit points,
 * keeps taking damage, makes recovery checks, and is healed -- see
 * `docs/conditions.md` ("The dying chain") and `docs/rulings.md`. The riskiest
 * automation in the app, because a mistake kills a character who should have
 * lived, so it is pure, small, and covered by a golden case for every
 * transition (`dyingChain.test.ts`).
 *
 * **Every number here is marked (confirm) in `docs/rulings.md`**: the rules
 * were written from memory of Player Core and not checked against the Archives of
 * Nethys. The GM can overrule any of it by setting the conditions directly.
 *
 * - **Knocked out** at 0 HP: dying 1 (2 on a critical), plus *wounded*; unconscious.
 * - **Damage at 0 HP**: dying +1 (+2 on a critical). A character who was stable
 *   (unconscious, no dying) is knocked out again.
 * - **Recovery check** at the start of the turn, against DC 10 + dying: critical
 *   success -2, success -1, failure +1, critical failure +2. Dying reaching 0 ends
 *   it: *wounded* rises by 1 and the character stays unconscious, stable.
 * - **Healing above 0 HP** ends dying and unconsciousness; *wounded* rises by 1 if
 *   the character was dying.
 * - **Death** when dying reaches 4 minus *doomed* (never less than 1), or when the
 *   damage left after reaching 0 is at least the character's maximum HP.
 *
 * Each function returns the new state and **events** saying what happened, so
 * the table is told and the GM can undo it.
 */

import type { DegreeOfSuccess } from '@hearthtable/dice/pure';

import type { AppliedCondition } from '../content/character.js';
import type { ConditionDefinitions } from './conditionMerge.js';
import { removeCondition, setCondition } from './conditionMerge.js';

/** The dying value that kills, before *doomed* lowers it. */
const DEATH_DYING = 4;

/** What the chain needs to know about a character. All zero and false is a healthy one. */
export interface DyingState {
  readonly dying: number;
  readonly wounded: number;
  readonly doomed: number;
  readonly unconscious: boolean;
}

export type DyingEvent =
  | { readonly kind: 'knockedOut'; readonly dying: number }
  | { readonly kind: 'dyingChanged'; readonly from: number; readonly to: number }
  | { readonly kind: 'woundedRaised'; readonly from: number; readonly to: number }
  | { readonly kind: 'stabilised' }
  | { readonly kind: 'revived' }
  | { readonly kind: 'dead'; readonly reason: 'dying' | 'massiveDamage' };

export interface DyingResult {
  readonly state: DyingState;
  /** The character has died: the caller marks it so. The state is where it ended. */
  readonly dead: boolean;
  readonly events: DyingEvent[];
}

/** Dying at or above this kills: 4, less *doomed*, never below 1. */
export function deathThreshold(doomed: number): number {
  return Math.max(1, DEATH_DYING - doomed);
}

/** The flat check DC for a recovery check. */
export function recoveryDc(dying: number): number {
  return 10 + dying;
}

/** How a recovery check changes dying: critical success -2, success -1, failure +1, critical failure +2. */
export function recoveryChange(degree: DegreeOfSuccess): number {
  switch (degree) {
    case 'criticalSuccess':
      return -2;
    case 'success':
      return -1;
    case 'failure':
      return 1;
    case 'criticalFailure':
      return 2;
  }
}

/** Whether damage left after reaching 0 hit points kills outright. */
export function instantDeath(options: {
  readonly remainingDamage: number;
  readonly maxHp: number;
}): boolean {
  return options.remainingDamage >= options.maxHp;
}

/** A result for a new dying value: dead at the threshold, with dying never stored above 4. */
function withDying(state: DyingState, dying: number, events: DyingEvent[]): DyingResult {
  const dead = dying >= deathThreshold(state.doomed);
  const stored = Math.min(dying, DEATH_DYING);
  if (stored !== state.dying) {
    events.push({ kind: 'dyingChanged', from: state.dying, to: stored });
  }
  if (dead) {
    events.push({ kind: 'dead', reason: 'dying' });
  }
  return { state: { ...state, dying: stored, unconscious: true }, dead, events };
}

/** Dropped to 0 hit points: dying 1 (2 on a critical) plus *wounded*, and unconscious. */
export function knockOut(
  state: DyingState,
  options: { readonly critical: boolean },
): DyingResult {
  const raw = (options.critical ? 2 : 1) + state.wounded;
  const dying = Math.min(raw, DEATH_DYING);
  const dead = raw >= deathThreshold(state.doomed);
  const events: DyingEvent[] = [{ kind: 'knockedOut', dying }];
  if (dead) {
    events.push({ kind: 'dead', reason: 'dying' });
  }
  return { state: { ...state, dying, unconscious: true }, dead, events };
}

/**
 * Taking damage while at 0 hit points: dying +1 (+2 on a critical). A stable
 * character (unconscious, not dying) is knocked out again. Call only for damage
 * that actually lands.
 */
export function damageWhileDying(
  state: DyingState,
  options: { readonly critical: boolean },
): DyingResult {
  if (state.dying === 0) {
    return knockOut(state, options);
  }
  return withDying(state, state.dying + (options.critical ? 2 : 1), []);
}

/**
 * A recovery check's result at the start of the turn. Dying reaching 0 ends it,
 * raises *wounded* by 1, and leaves the character unconscious and stable. Nothing
 * changes for a character who is not dying.
 */
export function recoveryCheck(state: DyingState, degree: DegreeOfSuccess): DyingResult {
  if (state.dying === 0) {
    return { state, dead: false, events: [] };
  }
  const next = state.dying + recoveryChange(degree);
  if (next > 0) {
    return withDying(state, next, []);
  }
  return {
    state: { ...state, dying: 0, wounded: state.wounded + 1, unconscious: true },
    dead: false,
    events: [
      { kind: 'dyingChanged', from: state.dying, to: 0 },
      { kind: 'stabilised' },
      { kind: 'woundedRaised', from: state.wounded, to: state.wounded + 1 },
    ],
  };
}

/**
 * Healed above 0 hit points. Dying and unconsciousness end, and *wounded* rises
 * by 1 if the character was dying; a stable character only wakes, so *wounded*
 * is never raised twice for one drop.
 */
export function healFromDying(state: DyingState): DyingResult {
  if (state.dying > 0) {
    return {
      state: { ...state, dying: 0, unconscious: false, wounded: state.wounded + 1 },
      dead: false,
      events: [
        { kind: 'dyingChanged', from: state.dying, to: 0 },
        { kind: 'revived' },
        { kind: 'woundedRaised', from: state.wounded, to: state.wounded + 1 },
      ],
    };
  }
  if (state.unconscious) {
    return {
      state: { ...state, unconscious: false },
      dead: false,
      events: [{ kind: 'revived' }],
    };
  }
  return { state, dead: false, events: [] };
}

/** The dying chain's state, read from a condition list. */
export function dyingStateOf(conditions: readonly AppliedCondition[]): DyingState {
  const valueOf = (slug: string) =>
    conditions.find((condition) => condition.slug === slug)?.value ?? 0;
  return {
    dying: valueOf('dying'),
    wounded: valueOf('wounded'),
    doomed: valueOf('doomed'),
    unconscious: conditions.some((condition) => condition.slug === 'unconscious'),
  };
}

/**
 * `conditions` with the chain's four conditions set to `state`, through the same
 * `setCondition` / `removeCondition` the GM's override uses, so every other
 * condition keeps its place. A dying character is always unconscious.
 */
export function withDyingState(
  conditions: readonly AppliedCondition[],
  state: DyingState,
  definitions?: ConditionDefinitions,
): AppliedCondition[] {
  let next = [...conditions];
  const valueOf = (slug: string) =>
    next.find((condition) => condition.slug === slug)?.value ?? 0;
  for (const [slug, value] of [
    ['dying', state.dying],
    ['wounded', state.wounded],
    ['doomed', state.doomed],
  ] as const) {
    if (valueOf(slug) === value) {
      continue;
    }
    next =
      value > 0
        ? setCondition(next, { slug, value }, definitions)
        : removeCondition(next, slug);
  }
  const unconscious = next.some((condition) => condition.slug === 'unconscious');
  const wanted = state.unconscious || state.dying > 0;
  if (wanted && !unconscious) {
    return setCondition(next, { slug: 'unconscious' }, definitions);
  }
  return !wanted && unconscious ? removeCondition(next, 'unconscious') : next;
}
