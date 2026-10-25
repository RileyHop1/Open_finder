/**
 * What the review step says: the draft in words, and every warning the
 * derivation raised, also in words. Pure; the step renders it.
 *
 * Nothing here blocks creating the character (ADR 0023): a warning is
 * something to read, and the character can be created with all of them.
 */

import type { DeriveWarning } from '@hearthtable/pf2e';

import { ATTRIBUTE_NAMES } from './boostPlan.js';
import { titleCase } from '../sheet/format.js';

const SOURCE_NAMES: Readonly<Record<string, string>> = {
  ancestry: 'ancestry',
  background: 'background',
  class: 'class',
  free: 'free',
};

/** One warning as a sentence, or `undefined` for one the review does not show. */
export function warningText(warning: DeriveWarning): string | undefined {
  switch (warning.kind) {
    case 'duplicate-boost':
      return `${ATTRIBUTE_NAMES[warning.attribute]} is boosted twice from the same source (${SOURCE_NAMES[warning.source] ?? warning.source}).`;
    case 'future-boost':
      return `A level ${warning.level} boost is counted, but the character is level 1.`;
    case 'key-attribute-not-offered':
      return `${ATTRIBUTE_NAMES[warning.attribute]} is not one of the key attributes this class offers.`;
    case 'too-many-trained-skills':
      return `${warning.chosen} skills chosen but only ${warning.allowed} allowed.`;
    case 'skill-trained-twice':
      return `${titleCase(warning.feature)} trains ${titleCase(warning.skill)}, which is already trained: choose one more skill in the Skills step instead.`;
    case 'skill-increase-not-available':
      return `A skill increase at level ${warning.level} is not available to this class.`;
    case 'feat-slot-not-available':
      return `A ${warning.slot} feat at level ${warning.level} is not a slot this class has.`;
    case 'choice-not-made':
      return `${titleCase(warning.feature)} still needs a choice (${titleCase(warning.choice)}).`;
    case 'choice-not-offered':
      return `${titleCase(warning.value)} is not one of the options for ${titleCase(warning.choice)}.`;
    case 'spellcasting-tradition-undecided':
      return `${titleCase(warning.classSlug)} casts from the tradition of your ${warning.choice}. Choose it (Class choices step); if the app cannot set it up from that yet, add the spellcasting by hand on the sheet.`;
    case 'too-many-cantrips':
      return `${warning.chosen} cantrips chosen but the class has ${warning.allowed}.`;
    case 'too-many-book-spells':
      return `${warning.chosen} rank 1 spells chosen but your ${warning.book} starts with ${warning.allowed}.`;
    case 'too-many-known-spells':
      return `${warning.chosen} spells chosen to know but your repertoire holds ${warning.allowed}.`;
    case 'deity-not-set':
      return `${titleCase(warning.classSlug)} serves a deity: enter its divine font and skill (Class choices step).`;
    case 'font-not-granted':
      return warning.spell === undefined
        ? `Your deity grants a ${warning.granted} font, not ${warning.font}.`
        : `${titleCase(warning.spell)} is for a deity that allows ${warning.font}; yours grants ${warning.granted}.`;
    case 'sanctification-mismatch':
      return warning.sanctification === undefined
        ? `${titleCase(warning.feature)} is ${warning.needs}: enter a ${warning.needs} sanctification for your deity (Class choices step).`
        : `${titleCase(warning.feature)} is ${warning.needs}, but your sanctification is ${warning.sanctification}.`;
    case 'not-a-spell':
      return `${titleCase(warning.slug)} was picked as a spell but is not one, so it is left out.`;
    // The preview has no compendium to look entries up in, so every grant would read as
    // missing here; the server looks them up for real when the character is created.
    case 'missing-entry':
      return undefined;
  }
}

/** Every warning that has something to say, in order, without repeats. */
export function warningLines(warnings: readonly DeriveWarning[]): string[] {
  const lines = warnings.map(warningText).filter((t): t is string => t !== undefined);
  return [...new Set(lines)];
}
