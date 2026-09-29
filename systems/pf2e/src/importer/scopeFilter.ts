/**
 * ADR 0006's scope filter: the second of the importer's two filters, and
 * the mechanism enforcing the core-four-books boundary as a publication
 * allow-list rather than a convention. Runs after the license filter --
 * only entries that already passed `applyLicenseFilter` have a `Provenance`
 * to check this against.
 *
 * `PUBLICATION_ALLOW_LIST` is the exact title strings real upstream data
 * uses ("Pathfinder Player Core", not "Player Core") -- confirmed against a
 * real fetch during the milestone 2 spike, not assumed; a near-miss here
 * would silently import nothing or everything. Adding a book is a one-line
 * change to this array plus a reviewed PR (ADR 0006) -- easy to do
 * deliberately, impossible to do by accident.
 */

import type { Provenance } from '@hearthtable/core';

export const PUBLICATION_ALLOW_LIST = [
  'Pathfinder Player Core',
  'Pathfinder Player Core 2',
  'Pathfinder GM Core',
  'Pathfinder Monster Core',
] as const;

export type AllowedPublication = (typeof PUBLICATION_ALLOW_LIST)[number];

export type ScopeFilterResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

function isAllowedPublication(publication: string): publication is AllowedPublication {
  return (PUBLICATION_ALLOW_LIST as readonly string[]).includes(publication);
}

/**
 * Applies the scope filter to an already-license-filtered entry's
 * provenance. Fails closed like the license filter: a publication not on
 * the list is rejected, never included by default -- there is no partial
 * or "probably fine" match.
 */
export function applyScopeFilter(provenance: Provenance): ScopeFilterResult {
  if (!isAllowedPublication(provenance.publication)) {
    return { ok: false, reason: 'publication-not-in-scope' };
  }
  return { ok: true };
}
