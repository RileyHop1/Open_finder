import { describe, expect, it } from 'vitest';

import {
  choiceSetElementSchema,
  damageDiceElementSchema,
  flatModifierElementSchema,
  grantItemElementSchema,
  inertRuleElementSchema,
  rollOptionElementSchema,
  ruleElementSchema,
} from './ruleElement.js';

describe('flatModifierElementSchema', () => {
  it('accepts a well-formed flat modifier', () => {
    const result = flatModifierElementSchema.safeParse({
      kind: 'flatModifier',
      selector: 'skill:athletics',
      label: 'Athletic Prowess',
      type: 'untyped',
      value: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an optional slug and predicate', () => {
    const result = flatModifierElementSchema.safeParse({
      kind: 'flatModifier',
      selector: 'ac',
      slug: 'shield-block',
      label: 'Shield',
      type: 'circumstance',
      value: 2,
      predicate: 'shield-raised',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-integer value -- formula-valued modifiers are out of scope for v1', () => {
    const result = flatModifierElementSchema.safeParse({
      kind: 'flatModifier',
      selector: 'ac',
      label: 'Whatever',
      type: 'untyped',
      value: '@actor.level',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized modifier type', () => {
    const result = flatModifierElementSchema.safeParse({
      kind: 'flatModifier',
      selector: 'ac',
      label: 'Whatever',
      type: 'morale',
      value: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('damageDiceElementSchema', () => {
  it('accepts a well-formed damage dice element', () => {
    const result = damageDiceElementSchema.safeParse({
      kind: 'damageDice',
      selector: 'strike-damage',
      diceNumber: 2,
      dieFaces: 6,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an overriding damage type', () => {
    const result = damageDiceElementSchema.safeParse({
      kind: 'damageDice',
      selector: 'strike-damage',
      diceNumber: 1,
      dieFaces: 6,
      damageType: 'fire',
    });
    expect(result.success).toBe(true);
  });

  it.each([4, 6, 8, 10, 12])('accepts a d%i', (faces) => {
    const result = damageDiceElementSchema.safeParse({
      kind: 'damageDice',
      selector: 'strike-damage',
      diceNumber: 1,
      dieFaces: faces,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a die size PF2e does not use', () => {
    const result = damageDiceElementSchema.safeParse({
      kind: 'damageDice',
      selector: 'strike-damage',
      diceNumber: 1,
      dieFaces: 20,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a zero or negative dice count', () => {
    const result = damageDiceElementSchema.safeParse({
      kind: 'damageDice',
      selector: 'strike-damage',
      diceNumber: 0,
      dieFaces: 6,
    });
    expect(result.success).toBe(false);
  });
});

describe('rollOptionElementSchema', () => {
  it('accepts an unconditional roll option', () => {
    expect(
      rollOptionElementSchema.safeParse({ kind: 'rollOption', option: 'raging' }).success,
    ).toBe(true);
  });

  it('accepts a predicated roll option', () => {
    const result = rollOptionElementSchema.safeParse({
      kind: 'rollOption',
      option: 'enlarged',
      predicate: { not: 'polymorphed' },
    });
    expect(result.success).toBe(true);
  });
});

describe('grantItemElementSchema', () => {
  it('references a granted item by our own packId + slug, not an upstream UUID', () => {
    const result = grantItemElementSchema.safeParse({
      kind: 'grantItem',
      packId: 'class-features',
      slug: 'reactive-strike',
    });
    expect(result.success).toBe(true);
  });
});

describe('choiceSetElementSchema', () => {
  it('accepts a prompt with at least one choice', () => {
    const result = choiceSetElementSchema.safeParse({
      kind: 'choiceSet',
      prompt: 'Choose a bloodline',
      choices: [
        { label: 'Draconic', value: 'draconic' },
        { label: 'Fey', value: 'fey' },
      ],
      rollOptionPrefix: 'bloodline',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty choice list', () => {
    const result = choiceSetElementSchema.safeParse({
      kind: 'choiceSet',
      prompt: 'Choose a bloodline',
      choices: [],
      rollOptionPrefix: 'bloodline',
    });
    expect(result.success).toBe(false);
  });
});

describe('inertRuleElementSchema', () => {
  it('accepts an upstream kind and a reason, and nothing else', () => {
    const result = inertRuleElementSchema.safeParse({
      kind: 'inert',
      upstreamKind: 'ItemAlteration',
      reason: 'unmapped-element-kind',
    });
    expect(result.success).toBe(true);
  });
});

describe('ruleElementSchema -- the discriminated union', () => {
  it('dispatches on kind to the right variant', () => {
    const inputs = [
      { kind: 'flatModifier', selector: 'ac', label: 'X', type: 'untyped', value: 1 },
      { kind: 'damageDice', selector: 'strike-damage', diceNumber: 1, dieFaces: 6 },
      { kind: 'rollOption', option: 'raging' },
      { kind: 'grantItem', packId: 'feats', slug: 'toughness' },
      {
        kind: 'choiceSet',
        prompt: 'Choose',
        choices: [{ label: 'A', value: 'a' }],
        rollOptionPrefix: 'choice',
      },
      { kind: 'inert', upstreamKind: 'Aura', reason: 'unmapped-element-kind' },
    ];
    for (const input of inputs) {
      expect(ruleElementSchema.safeParse(input).success).toBe(true);
    }
  });

  it('rejects a kind outside the v1 subset', () => {
    const result = ruleElementSchema.safeParse({ kind: 'aura', radius: 10 });
    expect(result.success).toBe(false);
  });
});
