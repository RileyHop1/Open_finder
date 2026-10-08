/**
 * Maps an upstream `class`-type entry onto a draft `ClassEntry`.
 *
 * Verified against the pinned upstream data (A1 of milestone 8): a class item
 * stores its *level 1* proficiencies as plain rank numbers (0 untrained to 4
 * legendary) -- `perception`, `savingThrows.{fortitude,reflex,will}`,
 * `attacks.{unarmed,simple,martial,advanced}` and
 * `defenses.{unarmored,light,medium,heavy}` -- plus `classDC` (null in every
 * class). It does **not** say when a rank improves: those rank-ups live in
 * the class feature's description text (the feature's rule elements are
 * empty), so an imported progression holds the starting rank only, as
 * `{ <rank>: 1 }`. The levels of the rank-ups are our own data
 * (`docs/character-build.md`, "Rank-ups").
 *
 * What it does read is every field the wizard needs from real data, and it
 * fails closed (`ok: false`) on anything else, never importing a class whose
 * proficiencies came out empty.
 */

import type { Provenance } from '@hearthtable/core';

import type {
  ClassAdvancement,
  ClassEntry,
  ClassProficiencies,
  ProficiencyProgression,
} from '../content/class.js';
import { ATTRIBUTES, traitSlugSchema, type Attribute } from '../content/common.js';
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

function isAttribute(value: string): value is Attribute {
  return (ATTRIBUTES as readonly string[]).includes(value);
}

const RANK_BY_NUMBER = ['untrained', 'trained', 'expert', 'master', 'legendary'] as const;

/**
 * A starting rank number (0-4) as a progression reached at level 1: untrained
 * is an empty progression (never reached), anything higher is `{ <rank>: 1 }`.
 * `undefined` for anything that is not an integer 0-4.
 */
function startingProgression(raw: unknown): ProficiencyProgression | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 4) {
    return undefined;
  }
  const rank = RANK_BY_NUMBER[raw];
  return rank === undefined || rank === 'untrained' ? {} : { [rank]: 1 };
}

const PROFICIENCY_FIELDS = [
  'perception',
  'fortitude',
  'reflex',
  'will',
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

/** Reads every starting-rank number a class needs in one pass, failing closed on the first one that is missing or not a rank. */
function mapProficiencies(
  system: Record<string, unknown>,
): ClassProficiencies | undefined {
  const savingThrows = asRecord(system.savingThrows) ?? {};
  const attacks = asRecord(system.attacks) ?? {};
  const defenses = asRecord(system.defenses) ?? {};
  const raw: Record<ProficiencyField, unknown> = {
    perception: system.perception,
    fortitude: savingThrows.fortitude,
    reflex: savingThrows.reflex,
    will: savingThrows.will,
    unarmedWeapon: attacks.unarmed,
    simpleWeapon: attacks.simple,
    martialWeapon: attacks.martial,
    advancedWeapon: attacks.advanced,
    unarmoredArmor: defenses.unarmored,
    lightArmor: defenses.light,
    mediumArmor: defenses.medium,
    heavyArmor: defenses.heavy,
  };

  const progressions = {} as Record<ProficiencyField, ProficiencyProgression>;
  for (const field of PROFICIENCY_FIELDS) {
    const progression = startingProgression(raw[field]);
    if (progression === undefined) {
      return undefined;
    }
    progressions[field] = progression;
  }

  // A class with no trained save at all has no proficiency data worth importing.
  const hasAnySave = [
    progressions.fortitude,
    progressions.reflex,
    progressions.will,
  ].some((p) => Object.keys(p).length > 0);
  if (!hasAnySave) {
    return undefined;
  }

  return {
    perception: progressions.perception,
    savingThrows: {
      fortitude: progressions.fortitude,
      reflex: progressions.reflex,
      will: progressions.will,
    },
    // Upstream's `classDC` is null in every class. Every class has a class DC
    // trained at level 1 (docs/character-build.md, "Rank-ups" -- confirm), so a
    // numeric upstream value wins if one ever appears, and trained is the default.
    classDc: startingProgression(system.classDC) ?? { trained: 1 },
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

/** Reads `system.<field>.value` as a list of levels 1-20, or `undefined` if it is missing, empty or malformed. */
function levelList(system: Record<string, unknown>, field: string): number[] | undefined {
  const value = asRecord(system[field])?.value;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((v) => Number.isInteger(v) && v >= 1 && v <= 20)
  ) {
    return undefined;
  }
  return value as number[];
}

/** The class's feat and skill-increase levels, or `undefined` if any of the five lists is missing. */
function mapAdvancement(system: Record<string, unknown>): ClassAdvancement | undefined {
  const ancestryFeatLevels = levelList(system, 'ancestryFeatLevels');
  const classFeatLevels = levelList(system, 'classFeatLevels');
  const generalFeatLevels = levelList(system, 'generalFeatLevels');
  const skillFeatLevels = levelList(system, 'skillFeatLevels');
  const skillIncreaseLevels = levelList(system, 'skillIncreaseLevels');
  if (
    ancestryFeatLevels === undefined ||
    classFeatLevels === undefined ||
    generalFeatLevels === undefined ||
    skillFeatLevels === undefined ||
    skillIncreaseLevels === undefined
  ) {
    return undefined;
  }
  return {
    ancestryFeatLevels,
    classFeatLevels,
    generalFeatLevels,
    skillFeatLevels,
    skillIncreaseLevels,
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

  const advancement = mapAdvancement(system);
  if (advancement === undefined) {
    return { ok: false, reason: 'missing-advancement-levels' };
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
  const text = htmlToRichText(description);
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
      text,
      keyAttributeOptions,
      hpPerLevel,
      proficiencies,
      skills: { trainedSkillCount, automaticallyTrained },
      advancement,
    },
  };
}
