import { describe, expect, it } from 'vitest';

import type { Pf2eEntry } from '../content/entry.js';
import { guessLabel, resolveLabelKeys } from './resolveLabelKeys.js';

/** An entry with only the field this pass reads. Invented. */
const withElements = (ruleElements: unknown[]) =>
  ({ ruleElements }) as unknown as Pf2eEntry;

const choice = (prompt: string, labels: string[]) => ({
  kind: 'choiceSet',
  prompt,
  rollOptionPrefix: 'invented',
  choices: labels.map((label, i) => ({ label, value: `v${i}` })),
});

describe('resolveLabelKeys', () => {
  const strings = new Map([
    ['PF2E.SpecificRule.Invented.Prompt', 'Select an invented thing.'],
    ['PF2E.SpecificRule.Invented.First', 'First'],
    ['PF2E.SkillVariant.VsInvented', 'vs. invented'],
  ]);

  it('resolves a choice’s prompt and labels from the lang strings', () => {
    const { entries, guessed } = resolveLabelKeys(
      [
        withElements([
          choice('PF2E.SpecificRule.Invented.Prompt', [
            'PF2E.SpecificRule.Invented.First',
          ]),
        ]),
      ],
      strings,
    );
    expect(entries[0]?.ruleElements[0]).toMatchObject({
      prompt: 'Select an invented thing.',
      choices: [{ label: 'First', value: 'v0' }],
    });
    expect(guessed).toEqual([]);
  });

  it('resolves a modifier’s label, and leaves plain text and other elements alone', () => {
    const modifier = {
      kind: 'flatModifier',
      selector: 'skill:athletics',
      label: 'PF2E.SkillVariant.VsInvented',
      type: 'circumstance',
      value: 1,
    };
    const grant = { kind: 'grantItem', packId: 'feats', slug: 'invented' };
    const { entries } = resolveLabelKeys(
      [withElements([modifier, grant, choice('Choose Doctrine', ['Warpriest'])])],
      strings,
    );
    expect(entries[0]?.ruleElements).toEqual([
      { ...modifier, label: 'vs. invented' },
      grant,
      choice('Choose Doctrine', ['Warpriest']),
    ]);
  });

  it('guesses a readable label for a key with no string, and counts it once', () => {
    const { entries, guessed } = resolveLabelKeys(
      [
        withElements([choice('PF2E.SpecificRule.Cleric.DivineFont.Prompt', [])]),
        withElements([choice('PF2E.SpecificRule.Cleric.DivineFont.Prompt', [])]),
      ],
      new Map(),
    );
    expect(entries[0]?.ruleElements[0]).toMatchObject({ prompt: 'Divine Font' });
    expect(guessed).toEqual(['PF2E.SpecificRule.Cleric.DivineFont.Prompt']);
  });
});

describe('guessLabel', () => {
  it.each([
    ['PF2E.BattleForm.Attack.Claw', 'Claw'],
    ['PF2E.SpecificRule.Cleric.DivineFont.Healing', 'Healing'],
    ['PF2E.SpecificRule.Cleric.DivineFont.Prompt', 'Divine Font'],
    ['PF2E.UI.RuleElements.ChoiceSet.YesLabel', 'Yes'],
    [
      'PF2E.SpecificRule.Equipment.HumbugPocket.ConcealAnObjectLabel',
      'Conceal An Object',
    ],
  ])('%s -> %s', (key, label) => {
    expect(guessLabel(key)).toBe(label);
  });
});
