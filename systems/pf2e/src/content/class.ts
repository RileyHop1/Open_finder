/**
 * The `class` and `classFeature` content kinds.
 *
 * A class's weapon/armor/save/perception/class-DC proficiencies are modeled
 * as **progressions** (the level each rank is reached), not a single
 * starting rank -- Player Core's class tables publish exactly this, it is
 * rules *data* rather than a wizard mechanic, and the golden set's level
 * 5/11/17 fixtures (Stack E) need it to compute a real answer rather than
 * guessing at progression. Contrast **skill** proficiency, which has no
 * fixed per-class table: which trained skill becomes expert at a given
 * level is a player choice at that level ("skill increases"), so only the
 * level-1 starting count is class data -- the choice itself is milestone
 * 7's wizard, not this schema.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import type { ProficiencyRank } from './common.js';
import { attributeSchema, proficiencyRankSchema, traitSlugSchema } from './common.js';

/**
 * The level at which each proficiency rank is reached, for one statistic.
 * Absent means that rank is never reached by this class in this category
 * (e.g. a Wizard's heavy-armor progression is entirely absent -- Wizards
 * never become proficient in heavy armor at all).
 *
 * A rank can be present with a lower rank absent -- a Fighter's martial
 * weapon progression is `{ expert: 1 }` with no `trained` entry at all,
 * because level 1 is a starting point, not a rank-up event: the character
 * simply *starts* at expert, with no separate moment of first becoming
 * trained to record. Only whichever ranks *are* present are validated, and
 * only for strictly increasing levels -- a table where "master" arrives at
 * or before "expert" is a data error regardless of which ranks exist.
 */
export const proficiencyProgressionSchema = z
  .object({
    trained: z.number().int().min(1).max(20).optional(),
    expert: z.number().int().min(1).max(20).optional(),
    master: z.number().int().min(1).max(20).optional(),
    legendary: z.number().int().min(1).max(20).optional(),
  })
  .refine(
    (progression) => {
      const levels = [
        progression.trained,
        progression.expert,
        progression.master,
        progression.legendary,
      ].filter((level): level is number => level !== undefined);
      return levels.every((level, i) => i === 0 || level > levels[i - 1]!);
    },
    {
      message:
        'each rank must be reached at a strictly later level than the one before it',
    },
  );

export type ProficiencyProgression = z.infer<typeof proficiencyProgressionSchema>;

/** Whether `rank` has been reached by `level` according to `progression`. Belongs here rather than Stack D because it only reads this schema's own shape -- no actor state, no Modifier. */
export function rankAtLevel(
  progression: ProficiencyProgression,
  level: number,
): ProficiencyRank {
  if (progression.legendary !== undefined && level >= progression.legendary)
    return 'legendary';
  if (progression.master !== undefined && level >= progression.master) return 'master';
  if (progression.expert !== undefined && level >= progression.expert) return 'expert';
  if (progression.trained !== undefined && level >= progression.trained) return 'trained';
  return 'untrained';
}

export const classSavingThrowProficienciesSchema = z.object({
  fortitude: proficiencyProgressionSchema,
  reflex: proficiencyProgressionSchema,
  will: proficiencyProgressionSchema,
});

export const classWeaponProficienciesSchema = z.object({
  unarmed: proficiencyProgressionSchema,
  simple: proficiencyProgressionSchema,
  martial: proficiencyProgressionSchema,
  advanced: proficiencyProgressionSchema,
});

export const classArmorProficienciesSchema = z.object({
  unarmored: proficiencyProgressionSchema,
  light: proficiencyProgressionSchema,
  medium: proficiencyProgressionSchema,
  heavy: proficiencyProgressionSchema,
});

export const classProficienciesSchema = z.object({
  perception: proficiencyProgressionSchema,
  savingThrows: classSavingThrowProficienciesSchema,
  classDc: proficiencyProgressionSchema,
  weapons: classWeaponProficienciesSchema,
  armor: classArmorProficienciesSchema,
});

export type ClassProficiencies = z.infer<typeof classProficienciesSchema>;

export const classSkillsSchema = z.object({
  /** The class's own contribution to trained-skill count at level 1 -- before the universal Intelligence-modifier addition every class also gets, which is chargen math, not class data. */
  trainedSkillCount: z.number().int().nonnegative(),
  /** Skills this class trains automatically regardless of player choice (e.g. a Barbarian's automatic Athletics). Free strings, like `background.trainedSkills`, for the same Lore-skill reason. */
  automaticallyTrained: z.array(z.string().min(1)).readonly().default([]),
});

export type ClassSkills = z.infer<typeof classSkillsSchema>;

/**
 * The levels at which a class grants each kind of advancement. These are
 * read straight from upstream's class data (they are not rank-ups; see
 * `docs/character-build.md`). Optional so that packs imported before this
 * field existed still load; the importer always writes it.
 */
export const classAdvancementSchema = z.object({
  ancestryFeatLevels: z.array(z.number().int().min(1).max(20)).readonly(),
  classFeatLevels: z.array(z.number().int().min(1).max(20)).readonly(),
  generalFeatLevels: z.array(z.number().int().min(1).max(20)).readonly(),
  skillFeatLevels: z.array(z.number().int().min(1).max(20)).readonly(),
  skillIncreaseLevels: z.array(z.number().int().min(1).max(20)).readonly(),
});

export type ClassAdvancement = z.infer<typeof classAdvancementSchema>;

export const classEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('class'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  /** More than one entry means a player choice (e.g. a Fighter picks Strength or Dexterity); exactly one means fixed (a Wizard is always Intelligence). */
  keyAttributeOptions: z.array(attributeSchema).min(1).readonly(),
  hpPerLevel: z.number().int().positive(),
  proficiencies: classProficienciesSchema,
  skills: classSkillsSchema,
  advancement: classAdvancementSchema.optional(),
});

export type ClassEntry = z.infer<typeof classEntrySchema>;

/**
 * What a class feature can raise a rank in: the saves and Perception, the class DC,
 * the spellcasting proficiency (spell attack and DC), and each weapon and armor
 * category. Matches the statistics `CharacterRanks` holds.
 */
export const RANK_UP_TARGETS = [
  'perception',
  'fortitude',
  'reflex',
  'will',
  'classDc',
  'spellcasting',
  'unarmed',
  'simple',
  'martial',
  'advanced',
  'unarmored',
  'light',
  'medium',
  'heavy',
] as const;

export type RankUpTarget = (typeof RANK_UP_TARGETS)[number];

export const rankUpTargetSchema = z.enum(RANK_UP_TARGETS);

export const classFeatureEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('classFeature'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  /** Which classes grant this, by slug in the `classes` pack (more than one for a feature several classes share, like Weapon Mastery). The relationship is stored here, not as a list on the class entry -- a class has dozens of features across 20 levels, and this keeps each side of the relationship in exactly one place. */
  classSlugs: z.array(z.string().min(1)).min(1).readonly(),
  level: z.number().int().min(1).max(20),
  /**
   * Choice tags (`system.traits.otherTags` upstream): `barbarian-instinct`,
   * `rogue-racket`, `ranger-hunters-edge`, ... A tagged feature is one of the
   * alternatives of some other feature's choice (the Instinct feature offers
   * every `barbarian-instinct`), so it is granted only by making that choice,
   * never automatically because the class reaches its level.
   */
  tags: z.array(z.string().min(1)).readonly().default([]),
  /**
   * The ranks this feature raises to, from its level on: Bravery makes Will expert,
   * Expert Spellcaster makes spellcasting expert, a Warpriest's first doctrine makes
   * light and medium armor trained and Fortitude expert. A raise, never a lowering:
   * the derivation keeps the better of this and what the character already has.
   */
  rankUps: z.partialRecord(rankUpTargetSchema, proficiencyRankSchema).default({}),
  /**
   * The skills this feature trains (or raises), by skill slug: the Thief racket
   * trains Thievery, a Druid order its order skill. Like `rankUps`, a raise from the
   * feature's level on, never a lowering.
   */
  skillRankUps: z.record(z.string().min(1), proficiencyRankSchema).default({}),
  /**
   * A Wizard's arcane school's curriculum: spell slugs (the `spells` pack) by rank,
   * `"0"` for the cantrips. Read from the school's text by the importer
   * (`readCurriculum.ts`); absent on every other feature.
   */
  curriculum: z
    .partialRecord(
      z.enum(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']),
      z.array(z.string().min(1)).readonly(),
    )
    .optional(),
});

export type ClassFeatureEntry = z.infer<typeof classFeatureEntrySchema>;
