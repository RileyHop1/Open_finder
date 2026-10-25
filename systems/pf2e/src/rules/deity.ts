/**
 * What a character's deity does to a build (`docs/character-build.md`, "Deity"): the
 * classes that serve one, the divine skill they train, and the warnings when a choice
 * does not match the deity's facts. The facts come from the player (`build.deity`); no
 * deity is imported. Nothing is refused (ADR 0023): a font the deity does not grant is
 * a warning the GM rules on.
 *
 * Checked against the pinned upstream text (2026-10-23), not Archives of Nethys: the
 * Cleric's and the Champion's Deity class features train the deity's divine skill (or
 * another of the player's choice when it is already trained), and a Cleric's divine font
 * is one its deity grants. **(confirm)** A Champion's holy causes are for a holy champion
 * and its unholy ones for an unholy champion (the Cause feature's "limited to
 * sanctification"), and its Lay on Hands or Touch of the Void devotion spell is for a
 * deity that allows heal or harm (checked 2026-10-24 against the same text). **(confirm)**
 */

import type { CharacterBuild } from '../content/characterBuild.js';
import type { ClassFeatureEntry } from '../content/class.js';
import { spellChoicesFor } from './classSpells.js';

/** The classes whose build names a deity. */
export const DEITY_CLASS_SLUGS: readonly string[] = ['cleric', 'champion'];

/** Whether `classSlug` serves a deity. */
export function servesDeity(classSlug: string | undefined): boolean {
  return classSlug !== undefined && DEITY_CLASS_SLUGS.includes(classSlug);
}

/** The divine skill the deity trains, for a class that serves one and a deity that names one. */
export function deitySkill(
  classSlug: string | undefined,
  build: Pick<CharacterBuild, 'deity'>,
): string | undefined {
  return servesDeity(classSlug) ? build.deity?.skill : undefined;
}

export type DeityWarning =
  /** A class that serves a deity, with none of its facts entered yet. */
  | { readonly kind: 'deity-not-set'; readonly classSlug: string }
  /**
   * A Cleric's divine font that its deity, as entered, does not grant, or a spell picked
   * for a font it does not allow (a Champion's Lay on Hands, for heal).
   */
  | {
      readonly kind: 'font-not-granted';
      readonly font: string;
      readonly granted: 'heal' | 'harm';
      /** The spell picked, when the font is a spell's (the Champion's devotion spell). */
      readonly spell?: string;
    }
  /** A holy or unholy feature (a Champion's cause) with a sanctification that does not match. */
  | {
      readonly kind: 'sanctification-mismatch';
      readonly feature: string;
      readonly needs: Sanctity;
      /** The sanctification entered for the deity, if any. */
      readonly sanctification?: 'holy' | 'unholy' | 'none';
    };

type Sanctity = 'holy' | 'unholy';
const SANCTITIES: readonly Sanctity[] = ['holy', 'unholy'];

/**
 * The features in `features` tagged holy or unholy (a Champion's Grandeur, its
 * Desecration) whose tag the sanctification in `build.deity` does not match, entered
 * or not. Shown for the GM to rule on, never refused (ADR 0023).
 */
export function sanctificationWarnings(
  features: readonly Pick<ClassFeatureEntry, 'slug' | 'tags'>[],
  build: Pick<CharacterBuild, 'deity'>,
): DeityWarning[] {
  const sanctification = build.deity?.sanctification;
  return features.flatMap((feature) =>
    SANCTITIES.filter((s) => feature.tags.includes(s) && s !== sanctification).map(
      (needs) => ({
        kind: 'sanctification-mismatch' as const,
        feature: feature.slug,
        needs,
        ...(sanctification === undefined ? {} : { sanctification }),
      }),
    ),
  );
}

/** What does not match the deity's facts in `build`. None for a class without a deity. */
export function deityWarnings(
  classSlug: string | undefined,
  build: Pick<CharacterBuild, 'deity' | 'classChoices'>,
): DeityWarning[] {
  if (classSlug === undefined || !servesDeity(classSlug)) {
    return [];
  }
  const deity = build.deity;
  if (deity === undefined || Object.keys(deity).length === 0) {
    return [{ kind: 'deity-not-set', classSlug }];
  }
  const granted = deity.font;
  if (granted !== 'heal' && granted !== 'harm') {
    return [];
  }
  const font = build.classChoices['divine-font'];
  const warnings: DeityWarning[] =
    font !== undefined && font !== granted
      ? [{ kind: 'font-not-granted', font, granted }]
      : [];
  for (const choice of spellChoicesFor(classSlug, build.classChoices)) {
    const needs =
      choice.chosen === undefined ? undefined : choice.needsFont?.[choice.chosen];
    if (choice.chosen !== undefined && needs !== undefined && needs !== granted) {
      warnings.push({
        kind: 'font-not-granted',
        font: needs,
        granted,
        spell: choice.chosen,
      });
    }
  }
  return warnings;
}
