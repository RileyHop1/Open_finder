/**
 * Adding, setting, and removing conditions on a character's list -- the pure
 * logic behind the server's condition operations. A character holds at most
 * one entry per condition slug (`characterDataSchema` enforces it), so these
 * functions are where "two sources of the same condition" gets resolved
 * before anything is stored.
 *
 * **Two entry points on purpose.** `addCondition` is what automation and
 * ordinary play use: a second source of a valued condition keeps the *higher*
 * value, never the sum (*frightened 2* then *frightened 1* is *frightened 2*;
 * `docs/conditions.md`). `setCondition` is the GM override path, which
 * CLAUDE.md requires beside every piece of automation: it sets the value
 * exactly, including lowering it, and a value of 0 removes the condition.
 *
 * Definitions come from the compendium (`conditionEntrySchema`) and are
 * optional: without one, a condition is treated as valued only if it arrives
 * with a value, has no maximum, and clears nothing. Both functions return a
 * new list and never mutate their input.
 */

import type { AppliedCondition } from '../content/character.js';
import type { ConditionEntry } from '../content/condition.js';

/** Conditions' compendium definitions by slug. */
export type ConditionDefinitions = ReadonlyMap<string, ConditionEntry>;

/** Drops every condition `incoming` supersedes: the slugs it `overrides`, and any other member of its mutually exclusive `group`. */
function clearSuperseded(
  current: readonly AppliedCondition[],
  slug: string,
  definitions: ConditionDefinitions,
): AppliedCondition[] {
  const definition = definitions.get(slug);
  if (definition === undefined) {
    return [...current];
  }
  return current.filter((existing) => {
    if (existing.slug === slug) {
      return true;
    }
    if (definition.overrides.includes(existing.slug)) {
      return false;
    }
    const existingGroup = definitions.get(existing.slug)?.group;
    return definition.group === undefined || existingGroup !== definition.group;
  });
}

/** The value to store for `incoming`, or `undefined` for a binary condition. Clamped to at least 1 and to the definition's maximum. */
function normalizedValue(
  incoming: AppliedCondition,
  definitions: ConditionDefinitions,
): number | undefined {
  const definition = definitions.get(incoming.slug);
  const valued = definition?.valued ?? incoming.value !== undefined;
  if (!valued) {
    return undefined;
  }
  const value = Math.max(1, incoming.value ?? 1);
  return definition?.maxValue === undefined
    ? value
    : Math.min(value, definition.maxValue);
}

function withEntry(
  list: readonly AppliedCondition[],
  entry: AppliedCondition,
): AppliedCondition[] {
  const index = list.findIndex((existing) => existing.slug === entry.slug);
  if (index === -1) {
    return [...list, entry];
  }
  return list.map((existing, i) => (i === index ? entry : existing));
}

function build(slug: string, value: number | undefined): AppliedCondition {
  return value === undefined ? { slug } : { slug, value };
}

/**
 * Adds `incoming`, merging with an existing entry of the same slug (higher
 * value wins) and clearing anything it supersedes. A binary condition that is
 * already present is left exactly as it was.
 */
export function addCondition(
  current: readonly AppliedCondition[],
  incoming: AppliedCondition,
  definitions: ConditionDefinitions = new Map(),
): AppliedCondition[] {
  const value = normalizedValue(incoming, definitions);
  const existing = current.find((condition) => condition.slug === incoming.slug);
  const merged =
    value === undefined || existing?.value === undefined
      ? value
      : Math.max(existing.value, value);
  const cleared = clearSuperseded(current, incoming.slug, definitions);
  return withEntry(cleared, build(incoming.slug, merged));
}

/**
 * Sets a condition to exactly `incoming`: the GM's manual edit. A valued
 * condition with a value of 0 or less is removed. Otherwise it behaves like
 * `addCondition` except that no merge happens, so a value can go down.
 */
export function setCondition(
  current: readonly AppliedCondition[],
  incoming: AppliedCondition,
  definitions: ConditionDefinitions = new Map(),
): AppliedCondition[] {
  if (incoming.value !== undefined && incoming.value <= 0) {
    return removeCondition(current, incoming.slug);
  }
  const cleared = clearSuperseded(current, incoming.slug, definitions);
  return withEntry(cleared, build(incoming.slug, normalizedValue(incoming, definitions)));
}

/** Removes the condition with `slug`, if present. */
export function removeCondition(
  current: readonly AppliedCondition[],
  slug: string,
): AppliedCondition[] {
  return current.filter((condition) => condition.slug !== slug);
}
