/**
 * Maps an upstream `equipment`/`consumable`/`treasure`/`backpack`-type
 * entry onto a draft `GearEntry`. Deliberately the simplest mapper: per
 * `gear.ts`'s own module doc, nothing beyond the shared envelope fields is
 * modeled, since no v1 rules math computes a statistic from ordinary gear.
 */

import type { Provenance } from '@hearthtable/core';

import { traitSlugSchema } from '../content/common.js';
import type { GearEntry } from '../content/gear.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { mapEntryRuleElements } from './mapRuleElements.js';
import type { UpstreamEntry } from './reader.js';
import {
  asRecord,
  filterValidTraitSlugs,
  nestedStringArrayField,
  nestedStringField,
  slugify,
} from './upstreamHelpers.js';

export function mapGear(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<GearEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
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
      packId: 'equipment',
      slug,
      name: entry.name,
      kind: 'gear',
      provenance,
      traits,
      ruleElements: elements,
      description,
    },
  };
}
