/**
 * Maps an upstream `condition`-type entry onto a draft `ConditionEntry`.
 * Upstream field paths below (`system.value.isValued` / `.max`,
 * `system.group`, `system.overrides`) are this project's best-informed
 * reading of Foundry's PF2e condition items -- **(confirm)** during the
 * real-data importer run. `isValued` is assumed present on every condition
 * item, valued or binary, the same way Foundry's own condition data
 * template applies it uniformly; if that assumption is wrong, every
 * condition fails closed together rather than a subset importing with a
 * silently wrong `valued` flag, which would be worse.
 *
 * `maxValue`, `group`, and `overrides` are all optional in
 * `conditionEntrySchema` and stay that way here: a missing or malformed
 * value for any of them means "this condition doesn't have one," not a
 * mapping failure, since none of the three is load-bearing enough to sink
 * the whole entry the way a missing damage block is for a weapon.
 */

import type { Provenance } from '@hearthtable/core';

import type { ConditionEntry } from '../content/condition.js';
import { traitSlugSchema } from '../content/common.js';
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

function mapOverrides(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  );
}

/**
 * The upstream groups whose members are mutually exclusive: a creature has one
 * detection state and one attitude toward you at a time. Every other upstream
 * `system.group` (`abilities`, `senses`, `death`) is a *display* grouping,
 * and a character can have several members at once (clumsy and enfeebled;
 * blinded and deafened). Our `group` field means "mutually exclusive", and
 * adding a condition clears the rest of its group, so a display grouping must
 * not be mapped onto it. Found by reading the first real import (2026-09-30):
 * 21 of 35 conditions carried a group, 5 distinct, and only two were exclusive.
 * See `docs/rulings.md`, "Which condition groups are mutually exclusive".
 */
const EXCLUSIVE_GROUPS: ReadonlySet<string> = new Set(['detection', 'attitudes']);

export function mapCondition(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<ConditionEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const valueRecord = asRecord(system.value);
  const valued = valueRecord?.isValued;
  if (typeof valued !== 'boolean') {
    return { ok: false, reason: 'missing-or-invalid-valued-flag' };
  }

  const maxValueRaw = valueRecord?.max;
  const maxValue =
    valued &&
    typeof maxValueRaw === 'number' &&
    Number.isInteger(maxValueRaw) &&
    maxValueRaw > 0
      ? maxValueRaw
      : undefined;

  const group =
    typeof system.group === 'string' && EXCLUSIVE_GROUPS.has(system.group)
      ? system.group
      : undefined;
  const overrides = mapOverrides(system.overrides);

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
      packId: 'conditions',
      slug,
      name: entry.name,
      kind: 'condition',
      provenance,
      traits,
      ruleElements: elements,
      description,
      valued,
      ...(maxValue !== undefined ? { maxValue } : {}),
      ...(group !== undefined ? { group } : {}),
      overrides,
    },
  };
}
