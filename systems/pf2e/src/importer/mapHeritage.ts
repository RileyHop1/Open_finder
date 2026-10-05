/**
 * Maps an upstream `heritage`-type entry onto a draft `HeritageEntry`.
 *
 * **The ancestry reference is handled defensively, not resolved like
 * `GrantItem`.** Upstream may reference the parent ancestry by a
 * compendium UUID, a bare slug, or an object carrying a `name` -- which of
 * these is genuinely used is **(confirm)**. Rather than adding a second
 * cross-entry resolution mechanism (`GrantItem`'s `UnresolvedGrantItem`
 * already covers that need for rule elements), this mapper tries each
 * plausible shape and **fails the whole entry closed**
 * (`unparseable-ancestry-reference`) if none fits -- silently treating an
 * ancestry-specific heritage as versatile would let a player choose a
 * heritage their ancestry shouldn't have, which is a rules bug, not a
 * cosmetic gap. A genuinely absent reference (no key at all) is a
 * confidently versatile heritage, not a parse failure.
 */

import type { Provenance } from '@hearthtable/core';

import { traitSlugSchema } from '../content/common.js';
import type { HeritageEntry } from '../content/heritage.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { htmlToRichText } from './htmlToRichText.js';
import { mapEntryRuleElements } from './mapRuleElements.js';
import type { UpstreamEntry } from './reader.js';
import {
  asRecord,
  filterValidTraitSlugs,
  nestedStringArrayField,
  nestedStringField,
  slugify,
} from './upstreamHelpers.js';

/** `{ ok: true, slug }` (present, undefined for versatile), or `{ ok: false }` if a reference exists but couldn't be read. */
function mapAncestryReference(
  raw: unknown,
): { readonly ok: true; readonly slug?: string } | { readonly ok: false } {
  if (raw === undefined || raw === null) {
    return { ok: true };
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return { ok: true, slug: raw };
  }
  const record = asRecord(raw);
  if (typeof record?.slug === 'string' && record.slug.length > 0) {
    return { ok: true, slug: record.slug };
  }
  if (typeof record?.name === 'string' && record.name.length > 0) {
    return { ok: true, slug: slugify(record.name) };
  }
  return { ok: false };
}

export function mapHeritage(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<HeritageEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const ancestryReference = mapAncestryReference(system.ancestry);
  if (!ancestryReference.ok) {
    return { ok: false, reason: 'unparseable-ancestry-reference' };
  }

  const slug =
    typeof system.slug === 'string' && system.slug.length > 0
      ? system.slug
      : slugify(entry.name);
  const traits = filterValidTraitSlugs(
    nestedStringArrayField(system, 'traits', 'value'),
    (value) => traitSlugSchema.safeParse(value).success,
  );
  const description = nestedStringField(system, 'description', 'value') ?? '';
  const text = htmlToRichText(description);
  const { elements } = mapEntryRuleElements(system.rules);

  return {
    ok: true,
    entry: {
      id: deterministicId(entry.id),
      schemaVersion: 1,
      createdAt: importedAt,
      updatedAt: importedAt,
      packId: 'heritages',
      slug,
      name: entry.name,
      kind: 'heritage',
      provenance,
      traits,
      ruleElements: elements,
      description,
      text,
      ...(ancestryReference.slug !== undefined
        ? { ancestrySlug: ancestryReference.slug }
        : {}),
    },
  };
}
