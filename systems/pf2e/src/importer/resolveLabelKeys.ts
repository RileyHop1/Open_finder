/**
 * Resolves the localization keys upstream leaves in rule elements' display
 * strings -- a choice's prompt and option labels
 * (`PF2E.SpecificRule.Cleric.DivineFont.Healing`) and a modifier's label
 * (`PF2E.SkillVariant.VsEmotion`) -- so the creator and the roll breakdowns show
 * "Healing" rather than the key. Upstream keeps these strings in its lang files
 * (`static/lang/re-en.json`, some in `en.json`), which `runImporter` reads under
 * their own pinned checksums.
 *
 * A key the lang strings do not have gets a readable guess from the key itself
 * (`DivineFont.Prompt` -> "Divine Font", `Attack.Claw` -> "Claw"), the same way
 * `inlineSyntax.ts` guesses a label it cannot resolve, and is counted, so a guess
 * is never silent. Only these display strings are touched: every other string an
 * entry carries is prose, resolved by `resolveEntryText.ts`.
 */

import type { RuleElement } from '@hearthtable/core';

import type { Pf2eEntry } from '../content/entry.js';

const KEY = /^PF2E(\.[A-Za-z0-9]+)+$/;

/** `DivineFont` -> `Divine Font`: the last segment (or the one before a trailing `Prompt`), in words. */
export function guessLabel(key: string): string {
  const segments = key.split('.');
  let index = segments.length - 1;
  while (index > 1 && /^(Prompt|Label|Title)$/.test(segments[index] ?? '')) {
    index--;
  }
  const segment = segments[index] ?? key;
  const words = segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  // `YesLabel` -> `Yes`: the word "Label" names what the key is, not what it says.
  return words.replace(/ Label$/, '');
}

export interface ResolveLabelKeysResult {
  readonly entries: readonly Pf2eEntry[];
  /** Keys no lang string matched, so a guess stands in (each counted once). */
  readonly guessed: readonly string[];
}

/** `entries` with every localization key in a choice's prompt or labels, or a modifier's label, resolved. */
export function resolveLabelKeys(
  entries: readonly Pf2eEntry[],
  strings: ReadonlyMap<string, string>,
): ResolveLabelKeysResult {
  const guessed = new Set<string>();
  const resolve = (text: string): string => {
    if (!KEY.test(text)) {
      return text;
    }
    const found = strings.get(text);
    if (found !== undefined && found.trim() !== '') {
      return found.trim();
    }
    guessed.add(text);
    return guessLabel(text);
  };
  const resolveElement = (element: RuleElement): RuleElement => {
    if (element.kind === 'choiceSet') {
      return {
        ...element,
        prompt: resolve(element.prompt),
        choices: element.choices.map((c) => ({ ...c, label: resolve(c.label) })),
      };
    }
    if (element.kind === 'flatModifier') {
      return { ...element, label: resolve(element.label) };
    }
    return element;
  };
  return {
    entries: entries.map((entry) =>
      entry.ruleElements.some((e) => e.kind === 'choiceSet' || e.kind === 'flatModifier')
        ? { ...entry, ruleElements: entry.ruleElements.map(resolveElement) }
        : entry,
    ),
    guessed: [...guessed].sort(),
  };
}
