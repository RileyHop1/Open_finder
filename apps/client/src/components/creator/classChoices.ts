/**
 * Which choices a class asks for at level 1, worked out from its features.
 * A feature due at level 1 with a `choiceSet` is a question (Instinct, Racket,
 * Hunter's Edge...); a pick that grants a feature can itself ask a question
 * (Animal Instinct asks which animal), so the walk follows the picks made.
 * Pure: the step renders this and the creator writes the answers into
 * `build.classChoices`; `deriveCharacter` is what grants the picked features.
 */

import type { ChoiceSetElement } from '@hearthtable/core';
import type { CharacterBuild, ClassFeatureEntry } from '@hearthtable/pf2e';

export interface DueChoice {
  /** The feature that asks. */
  readonly feature: ClassFeatureEntry;
  readonly element: ChoiceSetElement;
  /** What each option is, with the feature it grants when it grants one. */
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
    readonly feature?: ClassFeatureEntry | undefined;
  }[];
  /** The answer in the build, which may be one the feature does not offer. */
  readonly chosen: string | undefined;
}

export interface ChoicesDue {
  readonly choices: readonly DueChoice[];
  /** Features that ask something this app cannot offer yet; the table settles it by hand. */
  readonly unautomated: readonly string[];
}

/** The questions the class's level 1 features ask, given the answers so far. */
export function choicesDue(
  features: readonly ClassFeatureEntry[],
  classChoices: CharacterBuild['classChoices'],
  level = 1,
): ChoicesDue {
  const bySlug = new Map(features.map((f) => [f.slug, f] as const));
  const choices: DueChoice[] = [];
  const unautomated: string[] = [];
  const seen = new Set<string>();

  const visit = (feature: ClassFeatureEntry): void => {
    if (seen.has(feature.slug)) {
      return;
    }
    seen.add(feature.slug);
    for (const element of feature.ruleElements) {
      if (element.kind === 'inert' && element.upstreamKind === 'ChoiceSet') {
        unautomated.push(feature.name);
        continue;
      }
      if (element.kind !== 'choiceSet') {
        continue;
      }
      const chosen = classChoices[element.rollOptionPrefix];
      choices.push({
        feature,
        element,
        chosen,
        options: element.choices.map((choice) => ({
          ...choice,
          feature:
            element.grantsFromPackId === undefined ? undefined : bySlug.get(choice.value),
        })),
      });
      const picked = chosen === undefined ? undefined : bySlug.get(chosen);
      if (picked !== undefined && element.grantsFromPackId !== undefined) {
        visit(picked);
      }
    }
  };

  for (const feature of features) {
    // A tagged feature is one alternative of a choice, reached only by picking it.
    if (feature.level <= level && feature.tags.length === 0) {
      visit(feature);
    }
  }
  return { choices, unautomated: [...new Set(unautomated)] };
}
