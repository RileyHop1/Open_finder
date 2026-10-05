/**
 * Maps an upstream `weapon`-type entry onto a draft `WeaponEntry`. Upstream
 * field paths below (`system.category`, `system.group`, `system.damage.dice`
 * / `.die` / `.damageType`, `system.usage.value`, `system.range`,
 * `system.reload.value`) are this project's best-informed reading of
 * Foundry's PF2e system, not yet verified against a real fetch --
 * **(confirm)** during the real-data importer run. A wrong path fails
 * closed rather than importing a weapon with garbage fields.
 */

import type { Provenance } from '@hearthtable/core';

import { traitSlugSchema } from '../content/common.js';
import {
  WEAPON_CATEGORIES,
  WEAPON_DAMAGE_TYPES,
  WEAPON_GROUPS,
  type WeaponCategory,
  type WeaponDamageType,
  type WeaponEntry,
  type WeaponGroup,
} from '../content/weapon.js';
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
  parseDieSize,
  slugify,
} from './upstreamHelpers.js';

function isWeaponCategory(value: string): value is WeaponCategory {
  return (WEAPON_CATEGORIES as readonly string[]).includes(value);
}

function isWeaponGroup(value: string): value is WeaponGroup {
  return (WEAPON_GROUPS as readonly string[]).includes(value);
}

function isWeaponDamageType(value: string): value is WeaponDamageType {
  return (WEAPON_DAMAGE_TYPES as readonly string[]).includes(value);
}

/** Upstream's `usage.value` names how the weapon is held; only the two-handed case changes `hands` away from the default of 1. */
function mapHands(usageValue: unknown): 1 | 2 {
  return usageValue === 'held-in-two-hands' ? 2 : 1;
}

/** Upstream's `reload.value` is a string ("0", "1", "2"); "0", "-", absent, or unparsable all mean no reload step. */
function mapReload(reloadValue: unknown): number | undefined {
  if (typeof reloadValue !== 'string') {
    return undefined;
  }
  const parsed = Number.parseInt(reloadValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function mapWeapon(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<WeaponEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const category = system.category;
  if (typeof category !== 'string' || !isWeaponCategory(category)) {
    return { ok: false, reason: 'unrecognized-category' };
  }

  const group = system.group;
  if (typeof group !== 'string' || !isWeaponGroup(group)) {
    return { ok: false, reason: 'unrecognized-group' };
  }

  const damage = asRecord(system.damage);
  const diceNumber = damage?.dice;
  const dieFaces = parseDieSize(damage?.die);
  const damageType = damage?.damageType;
  if (
    typeof diceNumber !== 'number' ||
    !Number.isInteger(diceNumber) ||
    diceNumber <= 0
  ) {
    return { ok: false, reason: 'missing-or-invalid-damage-dice' };
  }
  if (dieFaces === undefined) {
    return { ok: false, reason: 'unsupported-die-size' };
  }
  if (typeof damageType !== 'string' || !isWeaponDamageType(damageType)) {
    return { ok: false, reason: 'unrecognized-damage-type' };
  }

  const range = system.range;
  const reload = mapReload(asRecord(system.reload)?.value);
  const priceInCopper = mapPriceInCopper(asRecord(system.price)?.value);
  const bulk = mapBulk(asRecord(system.bulk)?.value);
  const level = nestedNumberField(system, 'level', 'value');
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
      packId: 'equipment',
      slug,
      name: entry.name,
      kind: 'weapon',
      provenance,
      traits,
      ruleElements: elements,
      description,
      text,
      category,
      group,
      damage: { diceNumber, dieFaces, damageType },
      hands: mapHands(asRecord(system.usage)?.value),
      ...(typeof range === 'number' && range > 0 ? { range } : {}),
      ...(reload !== undefined ? { reload } : {}),
      ...(priceInCopper !== undefined ? { priceInCopper } : {}),
      ...(bulk !== undefined ? { bulk } : {}),
      ...(level !== undefined && Number.isInteger(level) && level >= 0 ? { level } : {}),
    },
  };
}
