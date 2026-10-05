/**
 * Maps an upstream `equipment`/`consumable`/`treasure`/`backpack`-type
 * entry onto a draft `GearEntry`. Beyond the shared envelope fields, this
 * reads price, Bulk, and level the same way `mapWeapon.ts`/`mapArmor.ts`
 * do (milestone 7's inventory economy, ADR 0021). The `consumable`
 * sub-shape (`gear.ts`) is filled by a later PR in that same milestone,
 * not this one.
 */

import type { Provenance } from '@hearthtable/core';

import { traitSlugSchema } from '../content/common.js';
import type { GearEntry } from '../content/gear.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { htmlToRichText } from './htmlToRichText.js';
import { mapEntryRuleElements } from './mapRuleElements.js';
import type { UpstreamEntry } from './reader.js';
import {
  asRecord,
  filterValidTraitSlugs,
  mapBulk,
  mapPriceInCopper,
  nestedNumberField,
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
  const text = htmlToRichText(description);
  const { elements } = mapEntryRuleElements(system.rules);
  const priceInCopper = mapPriceInCopper(asRecord(system.price)?.value);
  const bulk = mapBulk(asRecord(system.bulk)?.value);
  const level = nestedNumberField(system, 'level', 'value');

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
      text,
      ...(priceInCopper !== undefined ? { priceInCopper } : {}),
      ...(bulk !== undefined ? { bulk } : {}),
      ...(level !== undefined && Number.isInteger(level) && level >= 0 ? { level } : {}),
    },
  };
}
