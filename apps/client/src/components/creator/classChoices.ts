/**
 * Which choices a class asks for at level 1, worked out from its features.
 * A feature due at level 1 with a `choiceSet` is a question (Instinct, Racket,
 * Hunter's Edge...); a pick that grants a feature can itself ask a question
 * (Animal Instinct asks which animal), so the walk follows the picks made. A
 * question whose options the import could not read, but which is authored (a dragon
 * exemplar, an elemental influence), is asked from the authored options instead.
 * Pure: the step renders this and the creator writes the answers into
 * `build.classChoices`; `deriveCharacter` is what grants the picked features.
 */

import type { ChoiceSetElement } from '@hearthtable/core';
import {
  CLASS_SPELL_GRANTS,
  type CharacterBuild,
  type ClassFeatureEntry,
  type SubChoice,
} from '@hearthtable/pf2e';

import { titleCase } from '../sheet/format.js';

/**
 * The further choices `feature` asks for that its import could not read, authored in
 * the PF2e system's `classSpells.ts` (a Draconic sorcerer's dragon exemplar).
 */
function authoredFor(feature: ClassFeatureEntry): readonly SubChoice[] {
  return feature.classSlugs
    .flatMap((c) => CLASS_SPELL_GRANTS[c]?.subChoices ?? [])
    .filter((sub) => sub.feature === feature.slug);
}

/** `label` with "(holy)" or "(unholy)" when the feature is for that sanctification only (a Champion's cause). */
function withSanctity(label: string, feature: ClassFeatureEntry | undefined): string {
  const sanctity = (['holy', 'unholy'] as const).find((s) => feature?.tags.includes(s));
  return sanctity === undefined ? label : `${label} (${sanctity})`;
}

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
    const authored = authoredFor(feature);
    for (const sub of authored) {
      const options = sub.options.map((o) => ({
        value: o.value,
        label:
          o.skill === undefined ? o.label : `${o.label} (trains ${titleCase(o.skill)})`,
      }));
      choices.push({
        feature,
        element: {
          kind: 'choiceSet',
          prompt: sub.prompt,
          choices: options,
          rollOptionPrefix: sub.key,
        },
        chosen: classChoices[sub.key],
        options,
      });
    }
    for (const element of feature.ruleElements) {
      if (element.kind === 'inert' && element.upstreamKind === 'ChoiceSet') {
        if (authored.length === 0) {
          unautomated.push(feature.name);
        }
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
        options: element.choices.map((choice) => {
          const granted =
            element.grantsFromPackId === undefined ? undefined : bySlug.get(choice.value);
          return {
            ...choice,
            label: withSanctity(choice.label, granted),
            feature: granted,
          };
        }),
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
