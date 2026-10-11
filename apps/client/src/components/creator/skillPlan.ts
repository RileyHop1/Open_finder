/**
 * The trained skills the creator offers (milestone 8, `docs/character-build.md`
 * "Skills"). Some are trained outright, by the class or the background; the
 * player picks the rest, as many as the class allows plus Intelligence. A
 * Lore is a skill of the player's own naming, stored as `<name>-lore`.
 *
 * Nothing here refuses a pick (ADR 0023): too many, or one already trained,
 * is reported and still applied.
 */

import {
  SKILLS,
  applyBoosts,
  attributeForSkill,
  type Attribute,
  type BackgroundEntry,
  type ClassEntry,
} from '@hearthtable/pf2e';

import { titleCase } from '../sheet/format.js';
import { composeBoosts, type BoostEntries, type BoostPicks } from './boostPlan.js';

export { SKILLS, attributeForSkill };

/** `Academia Lore` to `academia-lore`; already ending in `lore` is not doubled. */
export function loreSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/(^|-)lore$/, '');
  return slug === '' ? '' : `${slug}-lore`;
}

/** Whether `slug` names one of the sixteen skills (anything else is a Lore). */
export const isNamedSkill = (slug: string): boolean =>
  (SKILLS as readonly string[]).includes(slug);

export interface AutomaticSkill {
  readonly skill: string;
  readonly from: 'class' | 'background';
}

export interface SkillSlots {
  /** Trained without a pick. */
  readonly automatic: readonly AutomaticSkill[];
  /** How many the player picks: the class's count plus Intelligence (never below 0). */
  readonly allowed: number;
}

/** The skills trained outright, and how many more the player picks. */
export function skillSlots(
  cls: ClassEntry | undefined,
  background: BackgroundEntry | undefined,
  intelligence: number,
): SkillSlots {
  return {
    automatic: [
      ...(cls?.skills.automaticallyTrained ?? []).map((skill) => ({
        skill,
        from: 'class' as const,
      })),
      ...(background?.trainedSkills ?? []).map((skill) => ({
        skill,
        from: 'background' as const,
      })),
    ],
    allowed: (cls?.skills.trainedSkillCount ?? 0) + Math.max(0, intelligence),
  };
}

/** The Intelligence modifier the boosts picked so far give. */
export function intelligenceOf(
  entries: BoostEntries,
  picks: BoostPicks,
  keyAttribute: Attribute | undefined,
): number {
  const { boosts, flaws } = composeBoosts(entries, picks, keyAttribute);
  return applyBoosts(boosts, flaws, 1).attributes.int;
}

/** What is off about the picks, in words; empty when they are as the rules ask. */
export function skillNotes(picked: readonly string[], slots: SkillSlots): string[] {
  const notes: string[] = [];
  if (picked.length > slots.allowed) {
    notes.push(
      `${picked.length} chosen but only ${slots.allowed} allowed. All are applied.`,
    );
  }
  for (const skill of picked) {
    const automatic = slots.automatic.find((a) => a.skill === skill);
    if (automatic !== undefined) {
      notes.push(
        `${titleCase(skill)} is already trained by your ${automatic.from}, so this pick adds nothing.`,
      );
    }
  }
  return notes;
}
