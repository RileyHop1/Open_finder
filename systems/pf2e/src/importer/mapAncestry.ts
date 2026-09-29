/**
 * Maps an upstream `ancestry`-type entry onto a draft `AncestryEntry`.
 * Upstream field paths below (`system.hp`, `system.size`, `system.speed`,
 * `system.boosts`/`system.flaws`, `system.languages.value`) are this
 * project's best-informed reading, not yet verified -- **(confirm)** during
 * the real-data importer run.
 *
 * Upstream's `size` is an abbreviated code (`"sm"`, `"med"`, `"lg"`, ...),
 * not our full-word `Size` -- mapped via `SIZE_CODE_TO_SIZE`.
 */

import type { Provenance } from '@hearthtable/core';

import { type AncestryEntry } from '../content/ancestry.js';
import {
  ATTRIBUTES,
  traitSlugSchema,
  type Attribute,
  type Size,
} from '../content/common.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
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

const SIZE_CODE_TO_SIZE: Record<string, Size> = {
  tiny: 'tiny',
  sm: 'small',
  med: 'medium',
  lg: 'large',
  huge: 'huge',
  grg: 'gargantuan',
};

function isAttribute(value: string): value is Attribute {
  return (ATTRIBUTES as readonly string[]).includes(value);
}

/**
 * Splits boost/flaw slots into fixed attributes (a slot naming exactly one
 * eligible attribute) and a count of free-choice slots (more than one
 * eligible attribute, usually all six).
 */
function splitAttributeSlots(slots: readonly string[][]): {
  readonly fixed: readonly Attribute[];
  readonly freeCount: number;
} {
  const fixed: Attribute[] = [];
  let freeCount = 0;
  for (const slot of slots) {
    if (slot.length === 1 && isAttribute(slot[0]!)) {
      fixed.push(slot[0]);
    } else if (slot.length > 1) {
      freeCount++;
    }
  }
  return { fixed, freeCount };
}

export function mapAncestry(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<AncestryEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const hp = system.hp;
  if (typeof hp !== 'number' || !Number.isInteger(hp) || hp <= 0) {
    return { ok: false, reason: 'missing-or-invalid-hp' };
  }

  const sizeCode = system.size;
  const size = typeof sizeCode === 'string' ? SIZE_CODE_TO_SIZE[sizeCode] : undefined;
  if (size === undefined) {
    return { ok: false, reason: 'unrecognized-size' };
  }

  const speed = system.speed;
  if (typeof speed !== 'number' || !Number.isInteger(speed) || speed <= 0) {
    return { ok: false, reason: 'missing-or-invalid-speed' };
  }

  const boosts = splitAttributeSlots(extractBoostSlots(system.boosts));
  const flaws = splitAttributeSlots(extractBoostSlots(system.flaws));

  const languages = nestedStringArrayField(system, 'languages', 'value') ?? [];
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
      packId: 'ancestries',
      slug,
      name: entry.name,
      kind: 'ancestry',
      provenance,
      traits,
      ruleElements: elements,
      description,
      hp,
      size,
      speed,
      boosts: boosts.fixed,
      freeBoosts: boosts.freeCount,
      flaws: flaws.fixed,
      languages,
    },
  };
}
