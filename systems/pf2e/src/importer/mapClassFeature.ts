/**
 * Maps an upstream class feature onto a draft `ClassFeatureEntry`.
 *
 * Verified against the pinned upstream data (milestone 8, W5 prep): a class
 * feature is not its own upstream type. It is a `feat` item whose
 * `system.category` is `classfeature`, in the `class-features` pack, so the
 * importer routes those here (`runImporter.ts`). Its level is
 * `system.level.value`, and the class (or classes: Weapon Mastery is shared by
 * six) it belongs to is carried as **traits** -- `system.traits.value` holds the
 * class slugs alongside any other trait. The mapper cannot tell which traits
 * are classes (it sees one entry), so it keeps them all as `classSlugs` and
 * dependency resolution (`resolveDependencies.ts`) trims them to the classes
 * that were actually kept, dropping a feature none of whose classes were.
 *
 * A feature with no traits at all fails closed: there is no such thing as a
 * class feature with no class.
 */

import type { Provenance } from '@hearthtable/core';

import type { ClassFeatureEntry } from '../content/class.js';
import { traitSlugSchema } from '../content/common.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { htmlToRichText } from './htmlToRichText.js';
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

export function mapClassFeature(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<ClassFeatureEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const classSlugs = nestedStringArrayField(system, 'traits', 'value') ?? [];
  if (classSlugs.length === 0) {
    return { ok: false, reason: 'missing-class-trait' };
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
  const tags = nestedStringArrayField(system, 'traits', 'otherTags') ?? [];
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
      packId: 'classFeatures',
      slug,
      name: entry.name,
      kind: 'classFeature',
      provenance,
      traits,
      ruleElements: elements,
      description,
      text,
      classSlugs,
      level,
      tags,
    },
  };
}
