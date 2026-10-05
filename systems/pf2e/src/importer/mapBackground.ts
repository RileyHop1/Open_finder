/**
 * Maps an upstream `background`-type entry onto a draft `BackgroundEntry`.
 * `system.boosts`/`system.trainedSkills.value` field paths are
 * **(confirm)**. The granted skill feat is carried through as an ordinary
 * `grantItem` rule element (already handled by `mapEntryRuleElements`), per
 * `background.ts`'s own design -- no special-casing needed here.
 */

import type { Provenance } from '@hearthtable/core';

import type { BackgroundEntry } from '../content/background.js';
import { ATTRIBUTES, traitSlugSchema, type Attribute } from '../content/common.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { htmlToRichText } from './htmlToRichText.js';
import { mapEntryRuleElements } from './mapRuleElements.js';
import type { UpstreamEntry } from './reader.js';
import {
  asRecord,
  extractBoostSlots,
  filterValidTraitSlugs,
  nestedStringArrayField,
  nestedStringField,
  slugify,
} from './upstreamHelpers.js';

function isAttribute(value: string): value is Attribute {
  return (ATTRIBUTES as readonly string[]).includes(value);
}

/**
 * A background's boost slots are (in the common case) one constrained
 * choice between a few attributes plus one universal free slot (all six
 * attributes eligible). `boostOptions` wants the constrained slot -- the
 * one whose eligible-attribute count is smaller than the full six.
 */
function findBoostOptions(boosts: unknown): readonly Attribute[] {
  const slots = extractBoostSlots(boosts).filter(
    (slot) => slot.length > 0 && slot.length < 6,
  );
  const constrained = slots[0] ?? extractBoostSlots(boosts)[0] ?? [];
  return constrained.filter(isAttribute);
}

export function mapBackground(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<BackgroundEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const boostOptions = findBoostOptions(system.boosts);
  if (boostOptions.length === 0) {
    return { ok: false, reason: 'missing-or-invalid-boost-options' };
  }

  const trainedSkills = nestedStringArrayField(system, 'trainedSkills', 'value') ?? [];
  if (trainedSkills.length === 0) {
    return { ok: false, reason: 'missing-trained-skills' };
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
      packId: 'backgrounds',
      slug,
      name: entry.name,
      kind: 'background',
      provenance,
      traits,
      ruleElements: elements,
      description,
      text,
      boostOptions,
      trainedSkills,
    },
  };
}
