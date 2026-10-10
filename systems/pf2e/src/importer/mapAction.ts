/**
 * Maps an upstream `action`-type entry onto a draft `ActionEntry`. See
 * `mapFeat.ts`'s module doc for the same caveat on upstream field paths
 * (`system.actionType.value` / `system.actions.value`) -- best-informed,
 * not yet verified, and failing closed rather than guessing wrong.
 */

import type { Provenance } from '@hearthtable/core';

import { traitSlugSchema } from '../content/common.js';
import type { ActionEntry } from '../content/action.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { htmlToRichText } from './htmlToRichText.js';
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

export function mapAction(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<ActionEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const actionType = nestedStringField(system, 'actionType', 'value');
  const actionCost = mapActionCost(
    actionType,
    nestedNumberField(system, 'actions', 'value'),
  );
  // Verified against the pinned upstream: 74 actions are `passive` (Pursue a
  // Lead, Cast a Spell) and are granted by class features, so dropping them
  // dropped the features. Only an *explicitly* passive action goes without a
  // cost; a missing or unrecognized type still fails closed.
  if (actionCost === undefined && actionType !== 'passive') {
    return { ok: false, reason: 'missing-or-unrecognized-action-cost' };
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

  return {
    ok: true,
    entry: {
      id: deterministicId(entry.id),
      schemaVersion: 1,
      createdAt: importedAt,
      updatedAt: importedAt,
      packId: 'actions',
      slug,
      name: entry.name,
      kind: 'action',
      provenance,
      traits,
      ruleElements: elements,
      description,
      text,
      ...(actionCost !== undefined ? { actionCost } : {}),
    },
  };
}
