import { describe, expect, it } from 'vitest';

import { mapRuleElement, mapRuleElements } from './elementMapper.js';

// Synthetic, invented upstream-shaped rule elements throughout -- never
// real content (ADR 0013).

describe('mapRuleElement -- FlatModifier', () => {
  it('maps a well-formed flat modifier', () => {
    const result = mapRuleElement({
      key: 'FlatModifier',
      selector: 'skill:athletics',
      type: 'untyped',
      value: 1,
      label: 'Athletic Prowess',
    });
    expect(result).toEqual({
      kind: 'flatModifier',
      selector: 'skill:athletics',
      label: 'Athletic Prowess',
      type: 'untyped',
      value: 1,
    });
  });

  it('falls back to the selector as the label when label and slug are both absent', () => {
    const result = mapRuleElement({
      key: 'FlatModifier',
      selector: 'ac',
      type: 'item',
      value: 1,
    });
    expect(result).toMatchObject({ label: 'ac' });
  });

  it('carries a predicate through when present', () => {
    const result = mapRuleElement({
      key: 'FlatModifier',
      selector: 'ac',
      type: 'circumstance',
      value: 2,
      predicate: ['shield-raised'],
    });
    expect(result).toMatchObject({ predicate: 'shield-raised' });
  });

  it('goes inert on a formula-valued modifier', () => {
    const result = mapRuleElement({
      key: 'FlatModifier',
      selector: 'ac',
      type: 'untyped',
      value: '@actor.level',
    });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'FlatModifier',
      reason: 'formula-value',
    });
  });

  it('goes inert on an unrecognized modifier type', () => {
    const result = mapRuleElement({
      key: 'FlatModifier',
      selector: 'ac',
      type: 'morale',
      value: 1,
    });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'FlatModifier',
      reason: 'unsupported-modifier-type',
    });
  });

  it('goes inert when its predicate is unmappable', () => {
    const result = mapRuleElement({
      key: 'FlatModifier',
      selector: 'ac',
      type: 'untyped',
      value: 1,
      predicate: [{ gte: ['@actor.level', 5] }],
    });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'FlatModifier',
      reason: 'unsupported-predicate',
    });
  });
});

describe('mapRuleElement -- DamageDice', () => {
  it('maps a well-formed damage dice element', () => {
    const result = mapRuleElement({
      key: 'DamageDice',
      selector: 'strike-damage',
      diceNumber: 2,
      dieSize: 'd6',
    });
    expect(result).toEqual({
      kind: 'damageDice',
      selector: 'strike-damage',
      diceNumber: 2,
      dieFaces: 6,
    });
  });

  it('carries an overriding damage type', () => {
    const result = mapRuleElement({
      key: 'DamageDice',
      selector: 'strike-damage',
      diceNumber: 1,
      dieSize: 'd6',
      damageType: 'fire',
    });
    expect(result).toMatchObject({ damageType: 'fire' });
  });

  it('goes inert on an unsupported die size', () => {
    const result = mapRuleElement({
      key: 'DamageDice',
      selector: 'strike-damage',
      diceNumber: 1,
      dieSize: 'd20',
    });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'DamageDice',
      reason: 'unsupported-die-size',
    });
  });

  it('goes inert on a formula-valued diceNumber', () => {
    const result = mapRuleElement({
      key: 'DamageDice',
      selector: 'strike-damage',
      diceNumber: '1 + @actor.level',
      dieSize: 'd6',
    });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'DamageDice',
      reason: 'formula-value',
    });
  });
});

describe('mapRuleElement -- RollOption', () => {
  it('maps a well-formed roll option', () => {
    expect(mapRuleElement({ key: 'RollOption', option: 'raging' })).toEqual({
      kind: 'rollOption',
      option: 'raging',
    });
  });

  it('goes inert when option is missing', () => {
    const result = mapRuleElement({ key: 'RollOption' });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'RollOption',
      reason: 'unsupported-shape',
    });
  });
});

describe('mapRuleElement -- GrantItem', () => {
  it('maps to an UnresolvedGrantItem carrying the raw uuid', () => {
    const result = mapRuleElement({
      key: 'GrantItem',
      uuid: 'Compendium.pf2e.classfeatures.Item.aaaaaaaaaaaaaaaa',
    });
    expect(result).toEqual({
      kind: 'unresolvedGrantItem',
      uuid: 'Compendium.pf2e.classfeatures.Item.aaaaaaaaaaaaaaaa',
    });
  });

  it('goes inert when uuid is missing', () => {
    expect(mapRuleElement({ key: 'GrantItem' })).toEqual({
      kind: 'inert',
      upstreamKind: 'GrantItem',
      reason: 'unsupported-shape',
    });
  });

  it('goes inert on a predicated grant -- grantItemElementSchema has no predicate field', () => {
    const result = mapRuleElement({
      key: 'GrantItem',
      uuid: 'Compendium.pf2e.classfeatures.Item.aaaaaaaaaaaaaaaa',
      predicate: ['some-condition'],
    });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'GrantItem',
      reason: 'predicate-unsupported-on-grant-item',
    });
  });
});

describe('mapRuleElement -- ChoiceSet', () => {
  it('maps a well-formed inline choice set', () => {
    const result = mapRuleElement({
      key: 'ChoiceSet',
      prompt: 'Choose a bloodline',
      rollOption: 'bloodline',
      choices: [
        { value: 'draconic', label: 'Draconic' },
        { value: 'fey', label: 'Fey' },
      ],
    });
    expect(result).toEqual({
      kind: 'choiceSet',
      prompt: 'Choose a bloodline',
      rollOptionPrefix: 'bloodline',
      choices: [
        { value: 'draconic', label: 'Draconic' },
        { value: 'fey', label: 'Fey' },
      ],
    });
  });

  it('goes inert on a predicated choice set -- choiceSetElementSchema has no predicate field', () => {
    const result = mapRuleElement({
      key: 'ChoiceSet',
      prompt: 'Choose',
      rollOption: 'choice',
      choices: [{ value: 'a', label: 'A' }],
      predicate: ['some-condition'],
    });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'ChoiceSet',
      reason: 'predicate-unsupported-on-choice-set',
    });
  });

  it('goes inert on non-inline choices (a UUID list or compendium query)', () => {
    const result = mapRuleElement({
      key: 'ChoiceSet',
      prompt: 'Choose a feat',
      rollOption: 'chosen-feat',
      choices: 'pf2e.feats-srd', // upstream's compendium-browser-query form
    });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'ChoiceSet',
      reason: 'non-inline-choices',
    });
  });

  it('goes inert when the roll option prefix is missing', () => {
    const result = mapRuleElement({
      key: 'ChoiceSet',
      prompt: 'Choose',
      choices: [{ value: 'a', label: 'A' }],
    });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'ChoiceSet',
      reason: 'missing-roll-option-prefix',
    });
  });
});

describe('mapRuleElement -- tag choices', () => {
  const tagChoice = {
    key: 'ChoiceSet',
    prompt: 'PF2E.SpecificRule.Invented.Prompt',
    flag: 'invented',
    choices: { filter: ['item:tag:invented-choice'] },
  };

  it('maps a single-tag filter to an unresolved tag choice, with the flag as the prefix', () => {
    expect(mapRuleElement(tagChoice)).toEqual({
      kind: 'unresolvedTagChoice',
      tag: 'invented-choice',
      flag: 'invented',
      prompt: 'PF2E.SpecificRule.Invented.Prompt',
      rollOptionPrefix: 'invented',
    });
  });

  it('prefers an explicit roll option over the flag', () => {
    const result = mapRuleElement({ ...tagChoice, rollOption: 'invented-pick' });
    expect(result).toMatchObject({ rollOptionPrefix: 'invented-pick' });
  });

  it.each([
    ['extra clauses', { filter: ['item:tag:a', 'item:level:1'] }],
    ['a different filter', { filter: ['item:trait:a'] }],
    ['an item type', { filter: ['item:tag:a'], itemType: 'weapon' }],
  ])('goes inert on %s -- the option list would be wrong', (_name, choices) => {
    expect(mapRuleElement({ ...tagChoice, choices })).toEqual({
      kind: 'inert',
      upstreamKind: 'ChoiceSet',
      reason: 'unsupported-choice-filter',
    });
  });

  it('goes inert without a flag', () => {
    const { flag: _flag, ...noFlag } = tagChoice;
    expect(mapRuleElement(noFlag)).toEqual({
      kind: 'inert',
      upstreamKind: 'ChoiceSet',
      reason: 'missing-flag',
    });
  });

  it('maps the dynamic grant of the chosen item to an unresolved chosen grant', () => {
    expect(
      mapRuleElement({
        key: 'GrantItem',
        uuid: '{item|flags.system.rulesSelections.invented}',
      }),
    ).toEqual({ kind: 'unresolvedChosenGrant', flag: 'invented' });
  });
});

describe('mapRuleElement -- everything else', () => {
  it('goes inert on an unmapped element kind, recording it', () => {
    const result = mapRuleElement({ key: 'ItemAlteration', mode: 'add' });
    expect(result).toEqual({
      kind: 'inert',
      upstreamKind: 'ItemAlteration',
      reason: 'unmapped-element-kind',
    });
  });

  it('goes inert on a malformed (non-object) rule element', () => {
    expect(mapRuleElement('not an object')).toEqual({
      kind: 'inert',
      upstreamKind: 'unknown',
      reason: 'malformed-rule-element',
    });
    expect(mapRuleElement(null)).toEqual({
      kind: 'inert',
      upstreamKind: 'unknown',
      reason: 'malformed-rule-element',
    });
    expect(mapRuleElement(['FlatModifier'])).toEqual({
      kind: 'inert',
      upstreamKind: 'unknown',
      reason: 'malformed-rule-element',
    });
  });
});

describe('mapRuleElements -- a progression flag', () => {
  const flag = (value: unknown, extra: Record<string, unknown> = {}) => ({
    key: 'ActiveEffectLike',
    mode: 'override',
    path: 'flags.system.invented',
    value,
    ...extra,
  });

  it('becomes one soft grant per class feature it names (a Cleric doctrine)', () => {
    expect(
      mapRuleElements(
        flag({
          firstStep: 'Compendium.pf2e.classfeatures.Item.First Step (Invented)',
          secondStep: 'Compendium.pf2e.classfeatures.Item.Second Step (Invented)',
        }),
      ),
    ).toEqual([
      {
        kind: 'unresolvedFlagGrant',
        uuid: 'Compendium.pf2e.classfeatures.Item.First Step (Invented)',
      },
      {
        kind: 'unresolvedFlagGrant',
        uuid: 'Compendium.pf2e.classfeatures.Item.Second Step (Invented)',
      },
    ]);
  });

  it('stays inert for a flag that names anything else, adds rather than overrides, or has a predicate', () => {
    const one = 'Compendium.pf2e.classfeatures.Item.First Step (Invented)';
    for (const raw of [
      flag({ form: 'Compendium.pf2e.spell-effects.Item.Invented Form' }),
      flag({ first: one, size: 2 }),
      flag({ first: one }, { mode: 'add' }),
      flag({ first: one }, { predicate: ['self:level'] }),
      { ...flag({ first: one }), path: 'system.proficiencies.defenses.light.rank' },
    ]) {
      expect(mapRuleElements(raw)).toEqual([mapRuleElement(raw)]);
      expect(mapRuleElements(raw)[0]).toMatchObject({ kind: 'inert' });
    }
  });

  it('maps every other element exactly as mapRuleElement does', () => {
    const grant = { key: 'GrantItem', uuid: 'Compendium.pf2e.feats-srd.Item.Invented' };
    expect(mapRuleElements(grant)).toEqual([mapRuleElement(grant)]);
  });
});
