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
 * is one its deity grants. **(confirm)**
 */

import type { CharacterBuild } from '../content/characterBuild.js';

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
  /** A Cleric's divine font that its deity, as entered, does not grant. */
  | {
      readonly kind: 'font-not-granted';
      readonly font: string;
      readonly granted: 'heal' | 'harm';
    };

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
  const font = build.classChoices['divine-font'];
  return font !== undefined &&
    (deity.font === 'heal' || deity.font === 'harm') &&
    font !== deity.font
    ? [{ kind: 'font-not-granted', font, granted: deity.font }]
    : [];
}
