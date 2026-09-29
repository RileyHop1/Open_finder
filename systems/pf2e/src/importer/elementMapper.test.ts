import { describe, expect, it } from 'vitest';

import { mapRuleElement } from './elementMapper.js';

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
