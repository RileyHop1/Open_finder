/**
 * Maps an upstream `class-feature`-type entry onto a draft `ClassFeatureEntry`.
 *
 * Which field carries the granting class -- a bare slug, a compendium UUID,
 * or an embedded object -- is **(confirm)**, so this accepts a bare slug or
 * an object with `slug`/`name`, the same defensive approach `mapHeritage`
 * uses for its ancestry reference. Unlike that reference, `classSlug` is
 * **required** by `classFeatureEntrySchema`, so a missing or unparseable
 * reference fails the whole entry closed rather than falling back to
 * "versatile" -- there is no such thing as a class-feature with no class.
 */

import type { Provenance } from '@hearthtable/core';

import type { ClassFeatureEntry } from '../content/class.js';
import { traitSlugSchema } from '../content/common.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { mapEntryRuleElements } from './mapRuleElements.js';
import type { UpstreamEntry } from './reader.js';
import {
  asRecord,
  filterValidTraitSlugs,
  nestedNumberField,
  nestedStringArrayField,
  nestedStringField,
  slugify,
} from './upstreamHelpers.js';

function mapClassReference(raw: unknown): string | undefined {
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }
  const record = asRecord(raw);
  if (typeof record?.slug === 'string' && record.slug.length > 0) {
    return record.slug;
  }
  if (typeof record?.name === 'string' && record.name.length > 0) {
    return slugify(record.name);
  }
  return undefined;
}

export function mapClassFeature(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<ClassFeatureEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const classSlug = mapClassReference(system.class);
  if (classSlug === undefined) {
    return { ok: false, reason: 'missing-or-unparseable-class-reference' };
  }

  const level = nestedNumberField(system, 'level', 'value');
  if (level === undefined || level < 1) {
    return { ok: false, reason: 'missing-or-invalid-level' };
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
  const { elements } = mapEntryRuleElements(system.rules);

  return {
    ok: true,
    entry: {
      id: deterministicId(entry.id),
      schemaVersion: 1,
      createdAt: importedAt,
      updatedAt: importedAt,
      packId: 'classFeatures',
      slug,
      name: entry.name,
      kind: 'classFeature',
      provenance,
      traits,
      ruleElements: elements,
      description,
      classSlug,
      level,
    },
  };
}
