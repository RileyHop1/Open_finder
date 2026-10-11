/**
 * The level 1 attribute boosts, as the creator lays them out (milestone 8,
 * `docs/character-build.md` "Boosts"). A character gets boosts from four
 * places: the ancestry (some fixed, some free), the background (one from two
 * options, one free), the class (its key attribute), and four free ones.
 *
 * The draft keeps only what the player *picked* (`boostPicks`). The fixed
 * boosts, and the key attribute's, are read from the entries every time, so
 * changing the ancestry or class can never leave a stale boost behind. The
 * full `build.boosts` is composed from the two (`composeBoosts`) for the
 * preview and for creating the character.
 *
 * Nothing here refuses a pick (ADR 0023): too many or too few in a section,
 * or an option the background does not offer, is reported and still applied.
 */

import {
  ATTRIBUTES,
  attributeSchema,
  type AncestryEntry,
  type Attribute,
  type AttributeBoost,
  type BackgroundEntry,
  type ClassEntry,
} from '@hearthtable/pf2e';
import { z } from 'zod';

export const ATTRIBUTE_NAMES: Readonly<Record<Attribute, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** The places a player chooses boosts. */
export const BOOST_SECTION_IDS = [
  'ancestry',
  'background-choice',
  'background-free',
  'free',
] as const;

export type BoostSectionId = (typeof BOOST_SECTION_IDS)[number];

/** What the player picked in each section; absent means nothing yet. */
export const boostPicksSchema = z
  .object({
    ancestry: z.array(attributeSchema),
    'background-choice': z.array(attributeSchema),
    'background-free': z.array(attributeSchema),
    free: z.array(attributeSchema),
  })
  .partial();

export type BoostPicks = z.infer<typeof boostPicksSchema>;

/** The entries the sections depend on. */
export interface BoostEntries {
  readonly ancestry?: AncestryEntry | undefined;
  readonly background?: BackgroundEntry | undefined;
  readonly class?: ClassEntry | undefined;
}

export interface BoostSection {
  readonly id: BoostSectionId;
  readonly label: string;
  /** Boosts the entry gives outright; shown, not chosen. */
  readonly fixed: readonly Attribute[];
  /** How many the player chooses here. */
  readonly count: number;
  /** What can be chosen: the background offers a few, everything else any. */
  readonly options: readonly Attribute[];
  readonly picked: readonly Attribute[];
}

/** The sections that apply to the entries picked so far. */
export function boostSections(
  entries: BoostEntries,
  picks: BoostPicks,
): readonly BoostSection[] {
  const sections: BoostSection[] = [];
  if (entries.ancestry !== undefined) {
    sections.push({
      id: 'ancestry',
      label: `${entries.ancestry.name} boosts`,
      fixed: entries.ancestry.boosts,
      count: entries.ancestry.freeBoosts,
      options: ATTRIBUTES,
      picked: picks.ancestry ?? [],
    });
  }
  if (entries.background !== undefined) {
    sections.push(
      {
        id: 'background-choice',
        label: `${entries.background.name} boost`,
        fixed: [],
        count: 1,
        options: entries.background.boostOptions,
        picked: picks['background-choice'] ?? [],
      },
      {
        id: 'background-free',
        label: `${entries.background.name} free boost`,
        fixed: [],
        count: 1,
        options: ATTRIBUTES,
        picked: picks['background-free'] ?? [],
      },
    );
  }
  sections.push({
    id: 'free',
    label: 'Free boosts',
    fixed: [],
    count: 4,
    options: ATTRIBUTES,
    picked: picks.free ?? [],
  });
  return sections;
}

/** The class's key attribute boost: the player's choice, else the class's first option. */
export function keyBoost(
  cls: ClassEntry | undefined,
  keyAttribute: Attribute | undefined,
): Attribute | undefined {
  return cls === undefined ? undefined : (keyAttribute ?? cls.keyAttributeOptions[0]);
}

/** The full level 1 boosts and flaws the picks and entries add up to, for `build`. */
export function composeBoosts(
  entries: BoostEntries,
  picks: BoostPicks,
  keyAttribute: Attribute | undefined,
): { boosts: AttributeBoost[]; flaws: Attribute[] } {
  const boosts: AttributeBoost[] = [];
  for (const section of boostSections(entries, picks)) {
    const source = section.id.startsWith('background')
      ? 'background'
      : section.id === 'free'
        ? 'free'
        : 'ancestry';
    const attributes = [...section.fixed, ...section.picked];
    if (attributes.length > 0) {
      boosts.push({ level: 1, source, attributes });
    }
  }
  const key = keyBoost(entries.class, keyAttribute);
  if (key !== undefined) {
    boosts.push({ level: 1, source: 'class', attributes: [key] });
  }
  return { boosts, flaws: [...(entries.ancestry?.flaws ?? [])] };
}

/** What is off about a section, in words; empty when it is as the rules ask. */
export function sectionNotes(section: BoostSection): string[] {
  const notes: string[] = [];
  const { count, picked, options } = section;
  if (picked.length > count) {
    notes.push(`${picked.length} chosen but only ${count} allowed. All are applied.`);
  }
  for (const attribute of picked) {
    if (!options.includes(attribute)) {
      notes.push(`${ATTRIBUTE_NAMES[attribute]} is not one of the options offered here.`);
    }
    if (section.fixed.includes(attribute)) {
      notes.push(
        `${ATTRIBUTE_NAMES[attribute]} is already boosted here, so this is a second boost.`,
      );
    }
  }
  return notes;
}

/** How many boosts are still to choose in a section. */
export function remaining(section: BoostSection): number {
  return Math.max(0, section.count - section.picked.length);
}
