/**
 * The feat slots a new character fills and what to offer in each (milestone 8,
 * `docs/character-build.md`). At level 1 that is an ancestry feat and a class
 * feat; a slot offers the feats of its category, narrowed to the character's
 * own ancestry or class by trait, and nothing else is hidden behind a refusal:
 * the player can always look at every feat of the category and take one with
 * a visible note (ADR 0023).
 *
 * Prerequisites are free text. The simple ones ("trained in Athletics") are
 * checked against the skills the character is trained in; everything else is
 * shown as written with "check with your GM".
 */

import {
  featSlotsUpTo,
  type AncestryEntry,
  type BackgroundEntry,
  type ClassEntry,
  type FeatSlot,
} from '@hearthtable/pf2e';

export interface SlotView {
  readonly slot: FeatSlot;
  readonly level: number;
  readonly label: string;
}

const SLOT_LABELS: Readonly<Record<FeatSlot, string>> = {
  ancestry: 'Ancestry feat',
  class: 'Class feat',
  skill: 'Skill feat',
  general: 'General feat',
  archetype: 'Archetype feat',
};

/** The feat slots open at creation, in the order a player fills them. */
export function creationSlots(cls: ClassEntry | undefined): SlotView[] {
  return featSlotsUpTo(1, cls?.advancement).map(({ slot, level }) => ({
    slot,
    level,
    label: SLOT_LABELS[slot],
  }));
}

export interface SlotFilter {
  readonly category: string;
  /** The trait that makes a feat the character's own: their ancestry or class. */
  readonly trait?: string;
  readonly maxLevel: number;
}

/** What a slot offers first. `trait` is absent when the character has not picked what it depends on, or the slot has no such trait. */
export function slotFilter(
  view: SlotView,
  ancestry: AncestryEntry | undefined,
  cls: ClassEntry | undefined,
): SlotFilter {
  const trait =
    view.slot === 'ancestry'
      ? ancestry?.slug
      : view.slot === 'class'
        ? cls?.slug
        : undefined;
  return {
    category: view.slot,
    ...(trait === undefined ? {} : { trait }),
    maxLevel: view.level,
  };
}

/** The skills the character is trained in so far: the class's, the background's, and the picked ones. */
export function trainedSkillsOf(
  cls: ClassEntry | undefined,
  background: BackgroundEntry | undefined,
  picked: readonly string[],
): ReadonlySet<string> {
  return new Set([
    ...(cls?.skills.automaticallyTrained ?? []),
    ...(background?.trainedSkills ?? []),
    ...picked,
  ]);
}

export type PrerequisiteStatus = 'met' | 'unmet' | 'unknown';

const TRAINED_IN = /^trained in ([a-z][a-z ]*?)\.?$/i;
const HIGHER_RANK = /^(expert|master|legendary) in /i;

/** Whether one prerequisite holds, when it is simple enough to tell; otherwise `unknown`. */
export function prerequisiteStatus(
  text: string,
  trained: ReadonlySet<string>,
): PrerequisiteStatus {
  const simple = TRAINED_IN.exec(text.trim());
  if (simple?.[1] !== undefined) {
    const skill = simple[1].trim().toLowerCase().replace(/\s+/g, '-');
    return trained.has(skill) ? 'met' : 'unmet';
  }
  // Nobody starts above trained, so a higher rank cannot be met at creation.
  if (HIGHER_RANK.test(text.trim())) {
    return 'unmet';
  }
  return 'unknown';
}

/** The whole feat: unmet if any prerequisite is, else unknown if any is, else met. */
export function featStatus(
  prerequisites: readonly string[],
  trained: ReadonlySet<string>,
): PrerequisiteStatus {
  const all = prerequisites.map((p) => prerequisiteStatus(p, trained));
  return all.includes('unmet') ? 'unmet' : all.includes('unknown') ? 'unknown' : 'met';
}

/** Sort key: feats whose prerequisites are met (or none) first, unknown next, unmet last. */
export const STATUS_ORDER: Readonly<Record<PrerequisiteStatus, number>> = {
  met: 0,
  unknown: 1,
  unmet: 2,
};
