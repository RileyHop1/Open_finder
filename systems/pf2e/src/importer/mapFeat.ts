/**
 * Maps an upstream `feat`-type entry (already past the license and scope
 * filters, so it has a `Provenance`) onto a draft `FeatEntry`.
 *
 * Upstream field paths below (`system.level.value`, `system.category`,
 * `system.prerequisites.value`, `system.actionType.value` /
 * `system.actions.value`) are this project's best-informed reading of
 * Foundry's PF2e system, not yet verified against a real fetch.
 * **(confirm)** each during the real-data importer run (C.11 / the
 * `import-smoke` CI job) -- a wrong path here fails closed (`ok: false`)
 * rather than importing a feat with garbage fields, which is exactly the
 * property that makes verifying against real data safe to defer.
 */

import type { Provenance } from '@hearthtable/core';

import { FEAT_CATEGORIES, type FeatCategory, type FeatEntry } from '../content/feat.js';
import { traitSlugSchema } from '../content/common.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { mapEntryRuleElements } from './mapRuleElements.js';
import type { UpstreamEntry } from './reader.js';
import {
  asRecord,
  filterValidTraitSlugs,
  mapActionCost,
  nestedNumberField,
  nestedStringArrayField,
  nestedStringField,
  slugify,
} from './upstreamHelpers.js';

function isFeatCategory(value: string): value is FeatCategory {
  return (FEAT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Upstream's prerequisites are an array of `{ value: string }` objects, not
 * plain strings -- **(confirm)**. Falls back to treating a plain string
 * array the same way, in case that assumption is wrong, so either real
 * shape produces the same result.
 */
function mapPrerequisites(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const prerequisites: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.length > 0) {
      prerequisites.push(item);
      continue;
    }
    const value = asRecord(item)?.value;
    if (typeof value === 'string' && value.length > 0) {
      prerequisites.push(value);
    }
  }
  return prerequisites;
}

export function mapFeat(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<FeatEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const level = nestedNumberField(system, 'level', 'value');
  if (level === undefined || level < 1) {
    return { ok: false, reason: 'missing-or-invalid-level' };
  }

  const category = system.category;
  if (typeof category !== 'string' || !isFeatCategory(category)) {
    return { ok: false, reason: 'unrecognized-category' };
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
  const prerequisites = mapPrerequisites(asRecord(system.prerequisites)?.value);
  const actionCost = mapActionCost(
    nestedStringField(system, 'actionType', 'value'),
    nestedNumberField(system, 'actions', 'value'),
  );
  const { elements } = mapEntryRuleElements(system.rules);

  return {
    ok: true,
    entry: {
      id: deterministicId(entry.id),
      schemaVersion: 1,
      createdAt: importedAt,
      updatedAt: importedAt,
      packId: 'feats',
      slug,
      name: entry.name,
      kind: 'feat',
      provenance,
      traits,
      ruleElements: elements,
      description,
      level,
      category,
      ...(actionCost !== undefined ? { actionCost } : {}),
      prerequisites,
    },
  };
}
