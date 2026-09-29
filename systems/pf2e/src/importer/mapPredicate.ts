/**
 * Maps an upstream rule element's `predicate` array onto
 * `@hearthtable/core`'s `Predicate`. This module, `elementMapper.ts`, and
 * nothing else, are where Foundry's rule-element format is known to exist
 * at all (ADR 0004 decision 3).
 *
 * Upstream's `predicate` is itself an **array**, evaluated as an implicit
 * AND of its elements -- not a single value the way our `Predicate` is. A
 * one-element array maps straight through; more than one wraps in `all`.
 * An absent or empty array means unconditional (`predicate: undefined`).
 *
 * Upstream elements our v1 predicate language doesn't support -- comparison
 * operators (`gt`/`gte`/`lt`/`lte`/`eq`), `xor`/`nand`/`nor` -- make the
 * *whole* predicate unmappable, not just that one clause: dropping a clause
 * silently would change what the condition means, which is exactly the
 * "wrong number worse than a visible gap" case ADR 0004 exists to avoid.
 * The caller's job is to send the whole rule element inert when this
 * returns `ok: false`, not to apply the element unconditionally.
 */

import type { Predicate } from '@hearthtable/core';

export type MapPredicateResult =
  { readonly ok: true; readonly predicate?: Predicate } | { readonly ok: false };

function mapPredicateElement(raw: unknown): Predicate | undefined {
  if (typeof raw === 'string') {
    return raw.length > 0 ? raw : undefined;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;

  if (Array.isArray(record.and)) {
    const mapped = record.and.map(mapPredicateElement);
    return mapped.some((clause) => clause === undefined)
      ? undefined
      : { all: mapped as Predicate[] };
  }
  if (Array.isArray(record.or)) {
    const mapped = record.or.map(mapPredicateElement);
    return mapped.some((clause) => clause === undefined)
      ? undefined
      : { any: mapped as Predicate[] };
  }
  if ('not' in record) {
    const mapped = mapPredicateElement(record.not);
    return mapped === undefined ? undefined : { not: mapped };
  }
  // gt/gte/lt/lte/eq, xor/nand/nor: not in v1's predicate subset.
  return undefined;
}

export function mapPredicateArray(raw: unknown): MapPredicateResult {
  if (raw === undefined) {
    return { ok: true };
  }
  if (!Array.isArray(raw)) {
    return { ok: false };
  }
  if (raw.length === 0) {
    return { ok: true };
  }

  const mapped: Predicate[] = [];
  for (const clause of raw) {
    const result = mapPredicateElement(clause);
    if (result === undefined) {
      return { ok: false };
    }
    mapped.push(result);
  }

  return mapped.length === 1
    ? { ok: true, predicate: mapped[0]! }
    : { ok: true, predicate: { all: mapped } };
}
