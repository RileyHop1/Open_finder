/**
 * Attribute boost math (ADR 0024, `docs/character-build.md`, "Boosts").
 *
 * Attributes are modifiers that start at +0. A boost adds +1; once the
 * modifier is +4 or more, a boost is only a *partial* boost, and two partial
 * boosts together add +1 **(confirm)**. A flaw takes 1 off. The result is
 * replayed from the build's list of boosts, so no half-step is ever stored:
 * a pending partial lives only in the returned `partial` flags.
 *
 * This only calculates. A rules problem (the same attribute boosted twice
 * from one source, a boost from a level the character has not reached) comes
 * back as a `warning` and the boost is still applied (ADR 0023).
 */

import { ATTRIBUTES, type Attribute } from '../content/common.js';
import type { AttributeBoost, BoostSource } from '../content/characterBuild.js';

/** The modifier at which a boost becomes a partial boost. */
export const PARTIAL_BOOST_FROM = 4;

/** A rules problem noticed while replaying boosts. Never a refusal. */
export type BoostWarning =
  | {
      readonly kind: 'duplicate-boost';
      readonly level: number;
      readonly source: BoostSource;
      readonly attribute: Attribute;
    }
  | {
      readonly kind: 'future-boost';
      readonly level: number;
      readonly source: BoostSource;
    };

export interface BoostResult {
  /** Each attribute's modifier after every flaw and boost. */
  readonly attributes: Readonly<Record<Attribute, number>>;
  /** Attributes holding one unmatched partial boost: the next boost on them completes a +1. */
  readonly partial: Readonly<Record<Attribute, boolean>>;
  readonly warnings: readonly BoostWarning[];
}

/**
 * Replays `flaws` then `boosts` (lowest level first, otherwise in the order
 * given) from all-zero modifiers. Pass `characterLevel` to be warned about a
 * boost from a level the character has not reached; it is still applied.
 */
export function applyBoosts(
  boosts: readonly AttributeBoost[],
  flaws: readonly Attribute[] = [],
  characterLevel?: number,
): BoostResult {
  const attributes = Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])) as Record<
    Attribute,
    number
  >;
  const partial = Object.fromEntries(ATTRIBUTES.map((a) => [a, false])) as Record<
    Attribute,
    boolean
  >;
  const warnings: BoostWarning[] = [];

  for (const flaw of flaws) {
    attributes[flaw] -= 1;
  }

  const ordered = boosts
    .map((boost, index) => ({ boost, index }))
    .sort((a, b) => a.boost.level - b.boost.level || a.index - b.index)
    .map((entry) => entry.boost);

  for (const { level, source, attributes: picked } of ordered) {
    if (characterLevel !== undefined && level > characterLevel) {
      warnings.push({ kind: 'future-boost', level, source });
    }
    const seen = new Set<Attribute>();
    for (const attribute of picked) {
      if (seen.has(attribute)) {
        warnings.push({ kind: 'duplicate-boost', level, source, attribute });
      }
      seen.add(attribute);

      if (attributes[attribute] < PARTIAL_BOOST_FROM) {
        attributes[attribute] += 1;
      } else if (partial[attribute]) {
        attributes[attribute] += 1;
        partial[attribute] = false;
      } else {
        partial[attribute] = true;
      }
    }
  }

  return { attributes, partial, warnings };
}
