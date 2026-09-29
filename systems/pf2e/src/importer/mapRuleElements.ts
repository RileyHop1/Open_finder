/**
 * Maps one upstream entry's full `system.rules` array (zero or more
 * elements) using `elementMapper.ts`'s `mapRuleElement`, and separately
 * collects the inert ones as `downgrades` -- the raw material the coverage
 * report (a later PR, ADR 0004 decision 5) counts by upstream kind and
 * reason.
 *
 * `downgrades` is a convenience view, not a second source of truth: every
 * downgrade is also present in `elements` (inert elements are never
 * dropped, ADR 0004 decision 4), just filtered out and flattened to the two
 * fields a count actually needs.
 */

import type { InertRuleElement } from '@hearthtable/core';

import type { MappedElement } from './elementMapper.js';
import { mapRuleElement } from './elementMapper.js';

export interface Downgrade {
  readonly upstreamKind: string;
  readonly reason: string;
}

export interface RuleElementMappingResult {
  /** In the same order as the input array; inert and unresolved-grant elements included. */
  readonly elements: readonly MappedElement[];
  readonly downgrades: readonly Downgrade[];
}

function isInert(element: MappedElement): element is InertRuleElement {
  return element.kind === 'inert';
}

/**
 * Maps `rules` -- an upstream item's `system.rules` value, `unknown` until
 * this point. Absent or `null` (the common case: most entries carry no
 * automation at all) maps to no elements, not an error. Present but not an
 * array is one `malformed-rules-array` downgrade -- a real upstream item
 * always has either no `rules` field or an array.
 */
export function mapEntryRuleElements(rules: unknown): RuleElementMappingResult {
  if (rules === undefined || rules === null) {
    return { elements: [], downgrades: [] };
  }

  if (!Array.isArray(rules)) {
    const malformed: InertRuleElement = {
      kind: 'inert',
      upstreamKind: 'unknown',
      reason: 'malformed-rules-array',
    };
    return {
      elements: [malformed],
      downgrades: [{ upstreamKind: malformed.upstreamKind, reason: malformed.reason }],
    };
  }

  const elements = rules.map(mapRuleElement);
  const downgrades = elements
    .filter(isInert)
    .map((element) => ({ upstreamKind: element.upstreamKind, reason: element.reason }));

  return { elements, downgrades };
}
