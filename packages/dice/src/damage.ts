/**
 * Damage evaluation. A damage roll is a set of components -- one or more
 * typed dice expressions, each with its own critical-hit doubling behavior
 * -- evaluated and bucketed by damage type. See docs/dice.md, "Damage".
 *
 * Unlike degreesOfSuccess.ts, this module stays fully system-agnostic: it
 * has no notion of "deadly" or "fatal" as named traits (docs/dice.md's
 * Scope section carves out only degrees-of-success as the exception
 * allowed to carry PF2e-specific knowledge). Instead it exposes the three
 * generic *doubling behaviors* those traits need, and a caller that knows
 * what "deadly" means -- systems/pf2e -- maps the trait onto them:
 *
 *   - PF2e's **deadly**: a `criticalOnly` component. Confirmed against
 *     Archives of Nethys: "the weapon adds a weapon damage die of the
 *     listed size. Roll this after doubling the weapon's damage" -- i.e.
 *     rolled only on a crit, and explicitly never doubled. Its die COUNT
 *     scales with striking runes, but not the way it looks at first
 *     glance: a plain striking rune does NOT add a second deadly die, only
 *     greater striking (2 dice) and major striking (3 dice) do. The caller
 *     is responsible for that count; this module just rolls whatever
 *     expression it's given.
 *   - PF2e's **fatal**: needs no special support here at all. Confirmed
 *     against Archives of Nethys (Player Core p.282): fatal's text has no
 *     "roll this after doubling" carve-out the way deadly's does, so its
 *     upgraded-and-added dice follow the default and DO double along with
 *     everything else. The caller just assembles a different `normal`
 *     expression for the critical case (e.g. swap "1d6+4" for "2d8+4");
 *     ordinary doubling handles the rest.
 *   - PF2e's **splash**: a `neverDoubled` component.
 *   - PF2e's **precision damage**: an ordinary `normal` component. It is
 *     called out in docs/dice.md only to clarify that it is NOT an
 *     exception, not because it needs unique handling.
 *   - **Persistent damage** is explicitly out of scope here -- it is a
 *     condition with its own recurring roll (docs/conditions.md), not part
 *     of a single damage roll's evaluation.
 */

import type { RandomSource, RollResult, RollTerm } from './types.js';
import { evaluate } from './evaluator.js';
import { parse } from './parser.js';

/**
 * How a damage component behaves under a critical hit.
 * - `normal` (default): always rolled; doubled when the hit is critical.
 * - `criticalOnly`: only rolled at all when the hit is critical; once
 *   rolled, never doubled (PF2e's deadly).
 * - `neverDoubled`: always rolled; never doubled even on a critical hit
 *   (PF2e's splash).
 */
export type DamageDoubling = 'normal' | 'criticalOnly' | 'neverDoubled';

export interface DamageComponent {
  /** A dice/arithmetic expression, e.g. "2d8+4". Parsed and evaluated like any other roll. */
  readonly expression: string;
  /** The damage type this component's total is bucketed under, e.g. "piercing", "fire", "splash". */
  readonly damageType: string;
  readonly doubling?: DamageDoubling;
}

export type EvaluateDamageErrorCode = 'invalid-expression' | 'unknown-reference';

export interface EvaluateDamageError {
  readonly code: EvaluateDamageErrorCode;
  readonly message: string;
}

export type EvaluateDamageResult =
  | { readonly ok: true; readonly result: RollResult }
  | { readonly ok: false; readonly error: EvaluateDamageError };

export interface EvaluateDamageOptions {
  readonly resolveReference?: (name: string) => number | undefined;
  readonly rng: RandomSource;
  readonly seed?: string;
}

/** Doubles every term's contribution, preserving `total === sum(terms.value)` (ADR 0008). */
function doubleTerms(terms: readonly RollTerm[]): RollTerm[] {
  return terms.map((term) => ({ ...term, value: term.value * 2 }));
}

/**
 * Evaluates a set of damage components against `critical`, returning a
 * `RollResult` whose `damage` field buckets the total by type.
 *
 * `total` and `terms` are never clamped -- they are the honest, literal sum
 * of what was rolled, same as any other roll result. Only `damage` (the
 * field resistances and weaknesses actually read downstream) is floored at
 * 0 per component type, per docs/dice.md: "damage reduced below 0 deals 0."
 */
export function evaluateDamage(
  components: readonly DamageComponent[],
  critical: boolean,
  options: EvaluateDamageOptions,
): EvaluateDamageResult {
  const allTerms: RollTerm[] = [];
  const rawByType = new Map<string, number>();
  const expressionParts: string[] = [];

  for (const component of components) {
    const doubling = component.doubling ?? 'normal';
    if (doubling === 'criticalOnly' && !critical) {
      continue;
    }

    const parsed = parse(component.expression);
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: 'invalid-expression',
          message: `damage component "${component.expression}" (${component.damageType}) failed to parse: ${parsed.error.message}`,
        },
      };
    }

    const outcome = evaluate(component.expression, parsed.expression, {
      rng: options.rng,
      ...(options.resolveReference ? { resolveReference: options.resolveReference } : {}),
    });
    if (!outcome.ok) {
      return {
        ok: false,
        error: { code: 'unknown-reference', message: outcome.error.message },
      };
    }

    const shouldDouble = doubling === 'normal' && critical;
    const terms = shouldDouble ? doubleTerms(outcome.result.terms) : outcome.result.terms;
    const componentTotal = terms.reduce((sum, term) => sum + term.value, 0);

    allTerms.push(...terms);
    rawByType.set(
      component.damageType,
      (rawByType.get(component.damageType) ?? 0) + componentTotal,
    );
    expressionParts.push(component.expression);
  }

  const total = allTerms.reduce((sum, term) => sum + term.value, 0);
  const damage: Record<string, number> = {};
  for (const [type, raw] of rawByType) {
    damage[type] = Math.max(0, raw);
  }

  const expression = expressionParts.join(' + ');
  const result: RollResult =
    options.seed === undefined
      ? { expression, total, terms: allTerms, damage }
      : { expression, total, terms: allTerms, damage, seed: options.seed };

  return { ok: true, result };
}
