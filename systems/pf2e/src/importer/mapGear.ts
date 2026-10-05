/**
 * Maps an upstream `equipment`/`consumable`/`treasure`/`backpack`-type
 * entry onto a draft `GearEntry`. Beyond the shared envelope fields, this
 * reads price, Bulk, and level the same way `mapWeapon.ts`/`mapArmor.ts`
 * do, and -- for a `consumable`-type entry only -- its category and
 * multi-use charges (milestone 7's inventory economy, ADR 0021).
 *
 * **`consumable.spell` (a scroll or wand's cast spell) is deliberately not
 * filled here.** Whether that reference survives depends on the full
 * imported entry set, the same way a `grantItem` target does -- a later
 * PR in this milestone adds that resolution step, the same way
 * `resolveDependencies.ts` already does for rule elements.
 */

import type { Provenance } from '@hearthtable/core';

import { traitSlugSchema } from '../content/common.js';
import {
  CONSUMABLE_CATEGORIES,
  type Consumable,
  type ConsumableCategory,
  type GearEntry,
} from '../content/gear.js';
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

function isConsumableCategory(value: string): value is ConsumableCategory {
  return (CONSUMABLE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Upstream's own consumable types are a longer, Foundry-specific list
 * (`mutagen`, `poison`, `oil`, `drug`, `snare`, `catalyst`, ...) than
 * `CONSUMABLE_CATEGORIES`, which only distinguishes what the inventory
 * panel's Use button and search need to. Anything outside our six named
 * categories becomes `'other'` -- a real, intentional category, not a
 * failure -- rather than rejecting the entry over a sub-category this
 * project doesn't otherwise act on.
 */
function mapConsumableCategory(value: unknown): ConsumableCategory {
  return typeof value === 'string' && isConsumableCategory(value) ? value : 'other';
}

/** Absent, non-integer, non-positive, or current-exceeds-max all mean "couldn't read multi-use data" -- treated as single-use, per `docs/inventory.md`, not as 0 uses. */
function mapConsumableUses(
  usesValue: unknown,
): { readonly current: number; readonly max: number } | undefined {
  const record = asRecord(usesValue);
  const current = record?.value;
  const max = record?.max;
  if (
    typeof current !== 'number' ||
    typeof max !== 'number' ||
    !Number.isInteger(current) ||
    !Number.isInteger(max) ||
    current < 0 ||
    max <= 0 ||
    current > max
  ) {
    return undefined;
  }
  return { current, max };
}

function mapConsumable(system: Record<string, unknown>): Consumable {
  const category = mapConsumableCategory(asRecord(system.consumableType)?.value);
  const uses = mapConsumableUses(system.uses);
  return {
    category,
    ...(uses !== undefined ? { uses } : {}),
  };
}

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
  const consumable = entry.type === 'consumable' ? mapConsumable(system) : undefined;

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
      ...(consumable !== undefined ? { consumable } : {}),
    },
  };
}
