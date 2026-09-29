/**
 * Maps an upstream `spell`-type entry onto a draft `SpellEntry`. The most
 * involved mapper in the importer, because upstream stores several spell
 * fields as loosely-structured or free-text strings where our schema wants
 * a structured shape -- every parse below is this project's best-informed
 * reading, not yet verified against a real fetch, and **(confirm)** during
 * the real-data importer run. Failing to parse a field fails the whole
 * entry closed (a specific `reason`) rather than guessing at its structure.
 *
 * **Heightening is deliberately never mapped, for now.** Upstream's
 * heightened effects are typically prose embedded in the main description
 * under a "Heightened (+1)" / "Heightened (4th)" sub-heading, not separated
 * out into a per-rank field the way `spellHeighteningSchema` wants. Rather
 * than guess at extracting that structure from HTML, this mapper omits
 * `heightening` entirely -- nothing is lost, since the full prose (including
 * heightening) is still in `description`; it just isn't separately
 * structured yet. Revisit once real data shows what upstream's
 * `system.heightening` actually contains.
 */

import type { Provenance } from '@hearthtable/core';

import { traitSlugSchema } from '../content/common.js';
import {
  AREA_SHAPES,
  MAGICAL_TRADITIONS,
  SPELL_SAVES,
  type AreaShape,
  type MagicalTradition,
  type SpellArea,
  type SpellDefense,
  type SpellEntry,
  type SpellRange,
  type SpellSave,
} from '../content/spell.js';
import { deterministicId } from './deterministicId.js';
import type { DraftEntry, MapContentResult } from './draftEntry.js';
import { mapEntryRuleElements } from './mapRuleElements.js';
import type { UpstreamEntry } from './reader.js';
import {
  asRecord,
  filterValidTraitSlugs,
  nestedNumberField,
  nestedStringArrayField,
  nestedStringField,
  slugify,
} from './upstreamHelpers.js';

function isMagicalTradition(value: string): value is MagicalTradition {
  return (MAGICAL_TRADITIONS as readonly string[]).includes(value);
}

function isAreaShape(value: string): value is AreaShape {
  return (AREA_SHAPES as readonly string[]).includes(value);
}

function isSpellSave(value: string): value is SpellSave {
  return (SPELL_SAVES as readonly string[]).includes(value);
}

/** Upstream's `time.value` is "1"/"2"/"3"/"reaction"/"free" for the common case, or free text for a slower cast -- translated to our ACTION_COSTS vocabulary where recognized, passed through as-is otherwise. */
function mapCastTime(timeValue: string): string {
  const mapping: Record<string, string> = {
    '1': 'one',
    '2': 'two',
    '3': 'three',
    reaction: 'reaction',
    free: 'free',
  };
  return mapping[timeValue] ?? timeValue;
}

/** Upstream's `range.value` is a human-readable string ("30 feet", "touch", "self", "unlimited"), not structured -- parsed here into our discriminated `SpellRange`. */
function mapRange(rangeValue: string): SpellRange | undefined {
  const trimmed = rangeValue.trim().toLowerCase();
  if (trimmed === 'touch') return { kind: 'touch' };
  if (trimmed === 'self') return { kind: 'self' };
  if (trimmed === 'unlimited') return { kind: 'unlimited' };
  const match = /^(\d+)\s*(?:feet|foot)$/.exec(trimmed);
  if (match) {
    return { kind: 'feet', value: Number.parseInt(match[1]!, 10) };
  }
  return undefined;
}

function mapArea(area: unknown): SpellArea | undefined {
  const record = asRecord(area);
  const shape = record?.type;
  const size = record?.value;
  if (typeof shape !== 'string' || !isAreaShape(shape)) {
    return undefined;
  }
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    return undefined;
  }
  return { shape, size };
}

function mapDefense(defense: unknown): SpellDefense | undefined {
  const save = asRecord(asRecord(defense)?.save);
  const statistic = save?.statistic;
  if (typeof statistic !== 'string' || !isSpellSave(statistic)) {
    return undefined;
  }
  return { save: statistic, basic: save?.basic === true };
}

export function mapSpell(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<SpellEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const rank = nestedNumberField(system, 'level', 'value');
  if (rank === undefined || rank < 1 || rank > 10) {
    return { ok: false, reason: 'missing-or-invalid-rank' };
  }

  const rawTimeValue = nestedStringField(system, 'time', 'value');
  if (rawTimeValue === undefined) {
    return { ok: false, reason: 'missing-cast-time' };
  }
  const castTime = mapCastTime(rawTimeValue);

  const rawRangeValue = nestedStringField(system, 'range', 'value');
  const range = rawRangeValue !== undefined ? mapRange(rawRangeValue) : undefined;
  if (range === undefined) {
    return { ok: false, reason: 'unparseable-range' };
  }

  const traditions = (nestedStringArrayField(system, 'traditions', 'value') ?? []).filter(
    isMagicalTradition,
  );
  const rawTraits = nestedStringArrayField(system, 'traits', 'value') ?? [];
  const traits = filterValidTraitSlugs(
    rawTraits,
    (value) => traitSlugSchema.safeParse(value).success,
  );
  // "sustained" is a trait upstream tags the spell with, not a separate field.
  const sustained = rawTraits.includes('sustained');

  const area = mapArea(system.area);
  const targets = nestedStringField(system, 'target', 'value');
  const duration = nestedStringField(system, 'duration', 'value');
  const defense = mapDefense(system.defense);

  const slug =
    typeof system.slug === 'string' && system.slug.length > 0
      ? system.slug
      : slugify(entry.name);
  const description = nestedStringField(system, 'description', 'value') ?? '';
  const { elements } = mapEntryRuleElements(system.rules);

  return {
    ok: true,
    entry: {
      id: deterministicId(entry.id),
      schemaVersion: 1,
      createdAt: importedAt,
      updatedAt: importedAt,
      packId: 'spells',
      slug,
      name: entry.name,
      kind: 'spell',
      provenance,
      traits,
      ruleElements: elements,
      description,
      rank,
      traditions,
      castTime,
      range,
      ...(area !== undefined ? { area } : {}),
      ...(targets !== undefined && targets.length > 0 ? { targets } : {}),
      ...(duration !== undefined && duration.length > 0 ? { duration } : {}),
      sustained,
      ...(defense !== undefined ? { defense } : {}),
    },
  };
}
