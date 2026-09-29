/**
 * Provenance: the source book and license recorded on every imported
 * compendium entry -- ADR 0003's decision 4, "record provenance on every
 * entry," made into a schema rather than a convention.
 *
 * This is deliberately narrow, not a general license-tracking vocabulary.
 * The only place a `Provenance` value is ever constructed is the importer,
 * after an upstream entry has already passed ADR 0003's license filter --
 * so a `Provenance` is really the *receipt* of having passed that filter,
 * not a free-standing description of any possible license. Restricting
 * `license` to a single value and `remaster` to `z.literal(true)` encodes
 * that structurally: there is no way to build a `Provenance` for content
 * this project is not allowed to ship, which is exactly the property ADR
 * 0003 wants a schema (not a code review) to guarantee.
 *
 * `publication` stays a free, non-empty string here rather than an enum of
 * the four core books (ADR 0006's allow-list) -- this package is
 * system-agnostic and must not know PF2e's book titles. The allow-list
 * itself lives in `systems/pf2e`'s importer, which is the only place that
 * decides which publications are acceptable in the first place.
 */

import { z } from 'zod';

/**
 * The licenses this project ever imports content under. Currently a single
 * value, on purpose -- see the module doc. Widen this the day a second
 * license is genuinely imported, not in anticipation of one.
 */
export const LICENSES = ['ORC'] as const;

export type License = (typeof LICENSES)[number];

export const licenseSchema = z.enum(LICENSES);

/**
 * Where one imported compendium entry came from: which book, under which
 * license, confirmed as Remaster material. See ADR 0003.
 *
 * `remaster` is `z.literal(true)` rather than `z.boolean()` for the same
 * reason `license` is a one-value enum: ADR 0003 requires Remaster content
 * specifically, so a `Provenance` that claims `remaster: false` would be
 * describing content this project has no license to ship. The type system
 * should not be able to represent that.
 */
export const provenanceSchema = z.object({
  publication: z.string().min(1),
  license: licenseSchema,
  remaster: z.literal(true),
});

export type Provenance = z.infer<typeof provenanceSchema>;
