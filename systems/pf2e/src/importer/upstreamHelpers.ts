/**
 * Small, defensive helpers shared by every per-kind content mapper
 * (`mapFeat.ts`, and the ones that follow it). `UpstreamEntry.system` is
 * `unknown` all the way until a mapper reads it -- these helpers read one
 * field at a time and return `undefined` on anything unexpected, rather
 * than throwing, so a mapper can fail closed on one missing field (`ok:
 * false, reason: '...'`) instead of crashing the whole import run.
 */

import type { ActionCost } from '../content/common.js';

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Reads `record[key][nested]` as a string, e.g. `system.description.value`. */
export function nestedStringField(
  record: Record<string, unknown>,
  key: string,
  nested: string,
): string | undefined {
  const value = asRecord(record[key])?.[nested];
  return typeof value === 'string' ? value : undefined;
}

/** Reads `record[key][nested]` as a number, e.g. `system.level.value`. */
export function nestedNumberField(
  record: Record<string, unknown>,
  key: string,
  nested: string,
): number | undefined {
  const value = asRecord(record[key])?.[nested];
  return typeof value === 'number' ? value : undefined;
}

/** Reads `record[key][nested]` as a string array, e.g. `system.traits.value`. */
export function nestedStringArrayField(
  record: Record<string, unknown>,
  key: string,
  nested: string,
): readonly string[] | undefined {
  const value = asRecord(record[key])?.[nested];
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.every((item): item is string => typeof item === 'string')
    ? value
    : undefined;
}

/**
 * A slug fallback for when an upstream entry lacks a usable `system.slug`
 * (or it isn't a valid slug shape): lowercase, non-alphanumeric runs
 * collapsed to a single hyphen, leading/trailing hyphens trimmed. Matches
 * how Foundry itself derives a slug from a name when one isn't set.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Maps upstream's `actionType.value` + `actions.value` pair onto
 * `ActionCost`. `undefined` covers both "passive, no action cost" (the
 * common case for most feats) and an actions count this mapping doesn't
 * recognize -- both mean "carry no action cost," not an error.
 */
export function mapActionCost(
  actionType: unknown,
  actionsValue: unknown,
): ActionCost | undefined {
  if (actionType === 'reaction') {
    return 'reaction';
  }
  if (actionType === 'free') {
    return 'free';
  }
  if (actionType === 'action') {
    if (actionsValue === 1) return 'one';
    if (actionsValue === 2) return 'two';
    if (actionsValue === 3) return 'three';
  }
  return undefined;
}

/**
 * Filters a raw trait list down to slugs `traitSlugSchema` actually
 * accepts, dropping anything malformed rather than failing the whole entry
 * over one bad trait -- traits are supplementary tags, not the entry's
 * identity.
 */
export function filterValidTraitSlugs(
  traits: readonly string[] | undefined,
  isValid: (value: string) => boolean,
): string[] {
  return (traits ?? []).filter(isValid);
}
