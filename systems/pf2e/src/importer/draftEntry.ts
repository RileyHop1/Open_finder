/**
 * What a per-kind content mapper produces, and the shared result shape
 * every one of them returns.
 */

import type { MappedElement } from './elementMapper.js';

/**
 * Identical to a real content entry except `ruleElements`, which may still
 * contain an `UnresolvedGrantItem` -- resolving those into
 * `@hearthtable/core`'s real `GrantItemElement` needs the full imported
 * entry set (the dependency-resolution pass, a later PR), which a
 * single-entry mapper doesn't have. The writer (a later PR) validates the
 * fully-resolved entry against its real Zod schema; nothing before that
 * point can, because a draft carrying an unresolved grant is not yet valid
 * against it.
 */
export type DraftEntry<T extends { ruleElements: unknown }> = Omit<T, 'ruleElements'> & {
  readonly ruleElements: readonly MappedElement[];
};

export type MapContentResult<T> =
  | { readonly ok: true; readonly entry: T }
  | { readonly ok: false; readonly reason: string };
