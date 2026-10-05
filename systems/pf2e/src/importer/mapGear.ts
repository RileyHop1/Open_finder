/**
 * Maps an upstream `equipment`/`consumable`/`treasure`/`backpack`-type
 * entry onto a draft `GearEntry`. Beyond the shared envelope fields, this
 * reads price, Bulk, and level the same way `mapWeapon.ts`/`mapArmor.ts`
 * do, and -- for a `consumable`-type entry only -- the `consumable`
 * sub-shape (milestone 7's inventory economy, ADR 0021).
 *
 * **`consumable.spell`'s upstream shape is unverified** -- this assumes a
 * scroll or wand embeds the spell it casts at `system.spell`, itself
 * shaped like a spell item (`system.spell.system.slug`,
 * `system.spell.system.level.value` for the cast/heightened rank), the
 * same way `mapWeapon.ts`'s field paths are flagged. **(confirm)** during
 * the real-data importer run.
 *
 * **The spell reference is only tentatively filled here.** This mapper
 * sees one entry at a time and cannot yet know whether that spell
 * actually survived import -- `resolveDependencies.ts` clears `spell`
 * back out, after the fact, for any reference that didn't (ADR 0021:
 * "excluded content is excluded whole" for the reference, not the whole
 * consumable). `packId: 'spells'` is always correct to fill in now: every
 * spell this importer keeps goes into that one pack (`mapSpell.ts`).
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

/** See the module doc's caveat on this shape. Returns undefined on anything unparsable rather than guessing a rank. */
function mapConsumableSpell(
  spellValue: unknown,
): { readonly packId: string; readonly slug: string; readonly rank: number } | undefined {
  const spellRecord = asRecord(spellValue);
  if (spellRecord === undefined) {
    return undefined;
  }
  const spellSystem = asRecord(spellRecord.system);
  const name = spellRecord.name;
  const rawSlug = spellSystem?.slug;
  const slug =
    typeof rawSlug === 'string' && rawSlug.length > 0
      ? rawSlug
      : typeof name === 'string' && name.length > 0
        ? slugify(name)
        : undefined;
  const rank =
    spellSystem === undefined
      ? undefined
      : nestedNumberField(spellSystem, 'level', 'value');
  if (
    slug === undefined ||
    rank === undefined ||
    !Number.isInteger(rank) ||
    rank < 1 ||
    rank > 10
  ) {
    return undefined;
  }
  return { packId: 'spells', slug, rank };
}

function mapConsumable(system: Record<string, unknown>): Consumable {
  const category = mapConsumableCategory(asRecord(system.consumableType)?.value);
  const uses = mapConsumableUses(system.uses);
  const spell = mapConsumableSpell(system.spell);
  return {
    category,
    ...(uses !== undefined ? { uses } : {}),
    ...(spell !== undefined ? { spell } : {}),
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
