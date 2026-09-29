/**
 * ADR 0003's license filter: keep an upstream entry only if it is ORC-
 * licensed Remaster content. This is the first of the importer's two
 * filters (the second, the core-four-books scope filter, is the next PR)
 * and the mechanism that actually enforces "never commit Paizo content we
 * don't have a license to ship."
 *
 * **Fails closed**: missing or unrecognized provenance is excluded, never
 * included by default. An entry that cannot produce a valid
 * `@hearthtable/core` `Provenance` is not content this importer will carry
 * forward under any circumstance.
 *
 * **Item vs. Actor provenance paths**, confirmed against a real upstream
 * fetch rather than assumed: an `Item`-type entry (feat, weapon, spell, ...)
 * stores its publication at `system.publication`. An `Actor`-type entry
 * (npc, hazard, character) stores the identical shape one level deeper, at
 * `system.details.publication`. Both are checked; neither is preferred over
 * the other, since a real entry only ever has one.
 */

import { provenanceSchema, type Provenance } from '@hearthtable/core';

import type { UpstreamEntry } from './reader.js';

export type LicenseFilterResult =
  | { readonly ok: true; readonly provenance: Provenance }
  | { readonly ok: false; readonly reason: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Finds the upstream publication object at either known path and reshapes
 * it onto `@hearthtable/core`'s field names (`title` -> `publication`).
 * Returns `undefined` if neither path has one -- callers treat that as
 * "no provenance," not as a different failure mode, per the fail-closed
 * policy above.
 */
function findUpstreamPublication(system: unknown): unknown {
  const record = asRecord(system);
  if (record === undefined) {
    return undefined;
  }

  const direct = record.publication;
  if (direct !== undefined) {
    return direct;
  }

  return asRecord(record.details)?.publication;
}

function toCandidateProvenance(upstreamPublication: unknown): unknown {
  const record = asRecord(upstreamPublication);
  if (record === undefined) {
    return undefined;
  }
  return {
    publication: record.title,
    license: record.license,
    remaster: record.remaster,
  };
}

/**
 * Applies the license filter to one upstream entry. `entry.system` is
 * `unknown` (from `reader.ts`) all the way until here -- this is the first
 * stage that looks inside it, and it looks only for the provenance shape,
 * nothing else.
 */
export function applyLicenseFilter(entry: UpstreamEntry): LicenseFilterResult {
  const candidate = toCandidateProvenance(findUpstreamPublication(entry.system));
  if (candidate === undefined) {
    return { ok: false, reason: 'missing-provenance' };
  }

  const result = provenanceSchema.safeParse(candidate);
  if (!result.success) {
    // Covers every rejection this schema can produce: a non-ORC license
    // (including real upstream data's own "OGL"), remaster: false, and a
    // missing or non-string publication title.
    return { ok: false, reason: 'not-orc-remaster' };
  }

  return { ok: true, provenance: result.data };
}
