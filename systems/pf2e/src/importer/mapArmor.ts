/**
 * Maps an upstream `armor`-type entry onto a draft `ArmorEntry`. Upstream
 * field paths below (`system.category`, `system.group`, `system.acBonus`,
 * `system.dexCap`, `system.checkPenalty`, `system.speedPenalty`,
 * `system.strength`) are this project's best-informed reading, not yet
 * verified -- **(confirm)** during the real-data importer run.
 *
 * `dexCap: 0` is a real, meaningful value (heavy armor commonly allows no
 * Dexterity bonus at all), so it is kept, not treated as "uncapped" the way
 * `strength: 0` is treated as "no requirement" below -- Strength scores are
 * never actually zero, so upstream uses 0 there to mean "none set."
 */

import type { Provenance } from '@hearthtable/core';

import { traitSlugSchema } from '../content/common.js';
import {
  ARMOR_CATEGORIES,
  ARMOR_GROUPS,
  type ArmorCategory,
  type ArmorEntry,
  type ArmorGroup,
} from '../content/armor.js';
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

function isArmorCategory(value: string): value is ArmorCategory {
  return (ARMOR_CATEGORIES as readonly string[]).includes(value);
}

function isArmorGroup(value: string): value is ArmorGroup {
  return (ARMOR_GROUPS as readonly string[]).includes(value);
}

export function mapArmor(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<ArmorEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const category = system.category;
  if (typeof category !== 'string' || !isArmorCategory(category)) {
    return { ok: false, reason: 'unrecognized-category' };
  }

  const acBonus = system.acBonus;
  if (typeof acBonus !== 'number' || !Number.isInteger(acBonus) || acBonus < 0) {
    return { ok: false, reason: 'missing-or-invalid-ac-bonus' };
  }

  const group = system.group;
  if (group !== undefined && (typeof group !== 'string' || !isArmorGroup(group))) {
    return { ok: false, reason: 'unrecognized-group' };
  }

  const dexCap = system.dexCap;
  const checkPenalty = system.checkPenalty;
  const speedPenalty = system.speedPenalty;
  const strength = system.strength;

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
      kind: 'armor',
      provenance,
      traits,
      ruleElements: elements,
      description,
      text,
      category,
      ...(typeof group === 'string' ? { group } : {}),
      acBonus,
      ...(typeof dexCap === 'number' && Number.isInteger(dexCap) && dexCap >= 0
        ? { dexCap }
        : {}),
      checkPenalty:
        typeof checkPenalty === 'number' &&
        Number.isInteger(checkPenalty) &&
        checkPenalty <= 0
          ? checkPenalty
          : 0,
      speedPenalty:
        typeof speedPenalty === 'number' &&
        Number.isInteger(speedPenalty) &&
        speedPenalty <= 0
          ? speedPenalty
          : 0,
      ...(typeof strength === 'number' && Number.isInteger(strength) && strength > 0
        ? { strength }
        : {}),
    },
  };
}
