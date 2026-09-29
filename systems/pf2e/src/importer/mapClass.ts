/**
 * Maps an upstream `class`-type entry onto a draft `ClassEntry`.
 *
 * Foundry's real class-item proficiency shape is unverified -- **(confirm)**
 * against real upstream data. This mapper reads a hypothetical
 * `system.{perception,savingThrows,classDC,weapons,armor}` shape that
 * mirrors our own `classProficienciesSchema` field-for-field, since that is
 * the closest guess available without a real fetch. Get it wrong and every
 * class import fails closed (`ok: false`) rather than importing a garbage
 * proficiency table, which is exactly the property that makes deferring
 * verification to the real-data importer run safe.
 */

import type { Provenance } from '@hearthtable/core';

import {
  proficiencyProgressionSchema,
  type ClassEntry,
  type ClassProficiencies,
  type ProficiencyProgression,
} from '../content/class.js';
import { ATTRIBUTES, traitSlugSchema, type Attribute } from '../content/common.js';
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

function isAttribute(value: string): value is Attribute {
  return (ATTRIBUTES as readonly string[]).includes(value);
}

/**
 * Reads one progression object (`{ trained?, expert?, master?, legendary? }`)
 * and validates it against the same schema the finished entry is ultimately
 * checked against, so a malformed table (e.g. master reached before expert)
 * fails the whole class closed rather than importing an invalid progression.
 * A missing or non-object value maps to `{}` -- a progression with every
 * rank absent, the same as a Wizard's heavy-armor progression.
 */
function readProgression(raw: unknown): ProficiencyProgression | undefined {
  const record = asRecord(raw) ?? {};
  const candidate: Record<string, number> = {};
  for (const rank of ['trained', 'expert', 'master', 'legendary'] as const) {
    const value = record[rank];
    if (typeof value === 'number') {
      candidate[rank] = value;
    }
  }
  const parsed = proficiencyProgressionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

const PROFICIENCY_FIELDS = [
  'perception',
  'fortitude',
  'reflex',
  'will',
  'classDc',
  'unarmedWeapon',
  'simpleWeapon',
  'martialWeapon',
  'advancedWeapon',
  'unarmoredArmor',
  'lightArmor',
  'mediumArmor',
  'heavyArmor',
] as const;
type ProficiencyField = (typeof PROFICIENCY_FIELDS)[number];

/** Reads every proficiency-progression table a class needs in one pass, failing closed on the first one that doesn't parse. */
function mapProficiencies(
  system: Record<string, unknown>,
): ClassProficiencies | undefined {
  const savingThrows = asRecord(system.savingThrows) ?? {};
  const weapons = asRecord(system.weapons) ?? {};
  const armor = asRecord(system.armor) ?? {};
  const raw: Record<ProficiencyField, unknown> = {
    perception: system.perception,
    fortitude: savingThrows.fortitude,
    reflex: savingThrows.reflex,
    will: savingThrows.will,
    classDc: system.classDC,
    unarmedWeapon: weapons.unarmed,
    simpleWeapon: weapons.simple,
    martialWeapon: weapons.martial,
    advancedWeapon: weapons.advanced,
    unarmoredArmor: armor.unarmored,
    lightArmor: armor.light,
    mediumArmor: armor.medium,
    heavyArmor: armor.heavy,
  };

  const progressions = {} as Record<ProficiencyField, ProficiencyProgression>;
  for (const field of PROFICIENCY_FIELDS) {
    const progression = readProgression(raw[field]);
    if (progression === undefined) {
      return undefined;
    }
    progressions[field] = progression;
  }

  return {
    perception: progressions.perception,
    savingThrows: {
      fortitude: progressions.fortitude,
      reflex: progressions.reflex,
      will: progressions.will,
    },
    classDc: progressions.classDc,
    weapons: {
      unarmed: progressions.unarmedWeapon,
      simple: progressions.simpleWeapon,
      martial: progressions.martialWeapon,
      advanced: progressions.advancedWeapon,
    },
    armor: {
      unarmored: progressions.unarmoredArmor,
      light: progressions.lightArmor,
      medium: progressions.mediumArmor,
      heavy: progressions.heavyArmor,
    },
  };
}

export function mapClass(
  entry: UpstreamEntry,
  provenance: Provenance,
  importedAt: string,
): MapContentResult<DraftEntry<ClassEntry>> {
  const system = asRecord(entry.system);
  if (system === undefined) {
    return { ok: false, reason: 'malformed-system' };
  }

  const keyAttributeOptions = (
    nestedStringArrayField(system, 'keyAbility', 'value') ?? []
  ).filter(isAttribute);
  if (keyAttributeOptions.length === 0) {
    return { ok: false, reason: 'missing-key-attribute-options' };
  }

  const hpPerLevel = system.hp;
  if (typeof hpPerLevel !== 'number' || hpPerLevel <= 0) {
    return { ok: false, reason: 'missing-or-invalid-hp' };
  }

  const proficiencies = mapProficiencies(system);
  if (proficiencies === undefined) {
    return { ok: false, reason: 'invalid-proficiency-progression' };
  }

  const trainedSkillCount = asRecord(system.trainedSkills)?.additional;
  if (typeof trainedSkillCount !== 'number' || trainedSkillCount < 0) {
    return { ok: false, reason: 'missing-or-invalid-trained-skill-count' };
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
  const automaticallyTrained =
    nestedStringArrayField(system, 'trainedSkills', 'value') ?? [];
  const { elements } = mapEntryRuleElements(system.rules);

  return {
    ok: true,
    entry: {
      id: deterministicId(entry.id),
      schemaVersion: 1,
      createdAt: importedAt,
      updatedAt: importedAt,
      packId: 'classes',
      slug,
      name: entry.name,
      kind: 'class',
      provenance,
      traits,
      ruleElements: elements,
      description,
      keyAttributeOptions,
      hpPerLevel,
      proficiencies,
      skills: { trainedSkillCount, automaticallyTrained },
    },
  };
}
