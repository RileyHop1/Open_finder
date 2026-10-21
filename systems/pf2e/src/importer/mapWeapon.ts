/**
 * Maps an upstream `weapon`-type entry onto a draft `WeaponEntry`. Upstream
 * field paths below (`system.category`, `system.group`, `system.damage.dice`
 * / `.die` / `.damageType`, `system.usage.value`, `system.range`,
 * `system.reload.value`, and an alchemical bomb's `system.splashDamage.value` and
 * `system.damage.persistent`) are this project's best-informed reading of
 * Foundry's PF2e system, not yet verified against a real fetch --
 * **(confirm)** during the real-data importer run. A wrong path fails
 * closed rather than importing a weapon with garbage fields.
 */

import type { Provenance } from '@hearthtable/core';

import { DAMAGE_TYPES, traitSlugSchema, type DamageType } from '../content/common.js';
import {
  WEAPON_CATEGORIES,
  WEAPON_GROUPS,
  type WeaponCategory,
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

function isDamageType(value: unknown): value is DamageType {
  return typeof value === 'string' && (DAMAGE_TYPES as readonly string[]).includes(value);
}

/**
 * An alchemical bomb's persistent damage, from upstream's `damage.persistent`
 * (`{ number, faces, type }`, `faces: null` for a flat amount). `undefined` when
 * there is none; `null` when there is one this cannot read, which fails the weapon
 * closed rather than dropping a part of what it does.
 */
function mapPersistent(raw: unknown): WeaponEntry['persistent'] | null {
  const persistent = asRecord(raw);
  if (persistent === undefined) {
    return undefined;
  }
  const { number, faces, type } = persistent;
  const dieFaces = typeof faces === 'number' ? parseDieSize(`d${faces}`) : undefined;
  if (
    typeof number !== 'number' ||
    !Number.isInteger(number) ||
    number <= 0 ||
    !isDamageType(type) ||
    (faces !== null && dieFaces === undefined)
  ) {
    return null;
  }
  return {
    diceNumber: number,
    ...(dieFaces === undefined ? {} : { dieFaces }),
    damageType: type,
  };
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

  // An ordinary weapon has dice of a physical type. An alchemical bomb can deal any
  // type, a flat amount (no die: an Acid Flask's 1) or nothing (a Glue Bomb's 0 dice).
  const damage = asRecord(system.damage);
  const diceNumber = damage?.dice;
  const die = damage?.die;
  const flat = die === undefined || die === null || die === '';
  const dieFaces = flat ? undefined : parseDieSize(die);
  const damageType = damage?.damageType;
  if (
    typeof diceNumber !== 'number' ||
    !Number.isInteger(diceNumber) ||
    diceNumber < 0 ||
    (diceNumber === 0 && !flat)
  ) {
    return { ok: false, reason: 'missing-or-invalid-damage-dice' };
  }
  if (!flat && dieFaces === undefined) {
    return { ok: false, reason: 'unsupported-die-size' };
  }
  if (!isDamageType(damageType)) {
    return { ok: false, reason: 'unrecognized-damage-type' };
  }
  const persistent = mapPersistent(damage?.persistent);
  if (persistent === null) {
    return { ok: false, reason: 'unrecognized-persistent-damage' };
  }
  const splash = asRecord(system.splashDamage)?.value;

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
      damage: { diceNumber, ...(dieFaces === undefined ? {} : { dieFaces }), damageType },
      ...(typeof splash === 'number' && Number.isInteger(splash) && splash > 0
        ? { splash }
        : {}),
      ...(persistent === undefined ? {} : { persistent }),
      hands: mapHands(asRecord(system.usage)?.value),
      ...(typeof range === 'number' && range > 0 ? { range } : {}),
      ...(reload !== undefined ? { reload } : {}),
      ...(priceInCopper !== undefined ? { priceInCopper } : {}),
      ...(bulk !== undefined ? { bulk } : {}),
      ...(level !== undefined && Number.isInteger(level) && level >= 0 ? { level } : {}),
    },
  };
}
