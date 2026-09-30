import type { RuleElement } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { applyRuleElements, type RuleElementSource } from './applyRuleElements.js';

function item(name: string, ruleElements: readonly RuleElement[]): RuleElementSource {
  return { name, ruleElements };
}

describe('applyRuleElements -- roll options', () => {
  it('passes base rollOptions through untouched', () => {
    const result = applyRuleElements({
      items: [],
      rollOptions: new Set(['trait:invented']),
    });

    expect(result.rollOptions).toEqual(new Set(['trait:invented']));
  });

  it('adds an unconditional rollOption element', () => {
    const result = applyRuleElements({
      items: [
        item('Invented Feat', [{ kind: 'rollOption', option: 'feature:invented' }]),
      ],
    });

    expect(result.rollOptions.has('feature:invented')).toBe(true);
  });

  it('adds a rollOption element only when its predicate passes', () => {
    const items = [
      item('Invented Feat', [
        { kind: 'rollOption', option: 'feature:invented', predicate: 'trait:required' },
      ]),
    ];

    const withoutTrait = applyRuleElements({ items });
    expect(withoutTrait.rollOptions.has('feature:invented')).toBe(false);

    const withTrait = applyRuleElements({
      items,
      rollOptions: new Set(['trait:required']),
    });
    expect(withTrait.rollOptions.has('feature:invented')).toBe(true);
  });

  it('resolves a rollOption whose predicate depends on another rollOption element, via the fixed-point loop', () => {
    const items = [
      item('Invented Feat A', [{ kind: 'rollOption', option: 'a' }]),
      item('Invented Feat B', [{ kind: 'rollOption', option: 'b', predicate: 'a' }]),
      item('Invented Feat C', [{ kind: 'rollOption', option: 'c', predicate: 'b' }]),
    ];

    const result = applyRuleElements({ items });

    expect(result.rollOptions).toEqual(new Set(['a', 'b', 'c']));
  });

  it('adds a choiceSet selection as a prefixed roll option', () => {
    const items = [
      item('Invented Bloodline Feature', [
        {
          kind: 'choiceSet',
          prompt: 'Choose a bloodline',
          choices: [
            { label: 'Draconic', value: 'draconic' },
            { label: 'Fey', value: 'fey' },
          ],
          rollOptionPrefix: 'bloodline',
        },
      ]),
    ];

    const result = applyRuleElements({
      items,
      choices: new Map([['bloodline', 'draconic']]),
    });

    expect(result.rollOptions.has('bloodline:draconic')).toBe(true);
    expect(result.rollOptions.has('bloodline:fey')).toBe(false);
  });

  it('ignores a choice value the choiceSet element does not actually offer', () => {
    const items = [
      item('Invented Bloodline Feature', [
        {
          kind: 'choiceSet',
          prompt: 'Choose a bloodline',
          choices: [{ label: 'Draconic', value: 'draconic' }],
          rollOptionPrefix: 'bloodline',
        },
      ]),
    ];

    const result = applyRuleElements({
      items,
      choices: new Map([['bloodline', 'not-a-real-option']]),
    });

    expect(result.rollOptions.has('bloodline:not-a-real-option')).toBe(false);
  });

  it('ignores a choice with no matching choiceSet element present at all', () => {
    const result = applyRuleElements({
      items: [],
      choices: new Map([['bloodline', 'draconic']]),
    });

    expect(result.rollOptions.size).toBe(0);
  });
});

describe('applyRuleElements -- flatModifier', () => {
  it('groups modifiers by selector', () => {
    const items = [
      item('Invented Armor', [
        {
          kind: 'flatModifier',
          selector: 'ac',
          label: 'Invented Bonus',
          type: 'item',
          value: 1,
        },
      ]),
      item('Invented Feat', [
        {
          kind: 'flatModifier',
          selector: 'perception',
          label: 'Invented Perception Bonus',
          type: 'status',
          value: 2,
        },
      ]),
    ];

    const result = applyRuleElements({ items });

    expect(result.modifiersBySelector.get('ac')).toEqual([
      {
        slug: 'invented-armor-0',
        label: 'Invented Bonus',
        type: 'item',
        value: 1,
        source: 'Invented Armor',
        enabled: true,
      },
    ]);
    expect(result.modifiersBySelector.get('perception')).toEqual([
      {
        slug: 'invented-feat-0',
        label: 'Invented Perception Bonus',
        type: 'status',
        value: 2,
        source: 'Invented Feat',
        enabled: true,
      },
    ]);
  });

  it('uses the element slug when one is provided, instead of deriving one', () => {
    const items = [
      item('Invented Feat', [
        {
          kind: 'flatModifier',
          selector: 'ac',
          slug: 'stable-slug',
          label: 'Invented Bonus',
          type: 'item',
          value: 1,
        },
      ]),
    ];

    const result = applyRuleElements({ items });

    expect(result.modifiersBySelector.get('ac')?.[0]?.slug).toBe('stable-slug');
  });

  it('combines modifiers from multiple items into the same selector', () => {
    const items = [
      item('Invented Feat A', [
        {
          kind: 'flatModifier',
          selector: 'ac',
          label: 'Bonus A',
          type: 'circumstance',
          value: 1,
        },
      ]),
      item('Invented Feat B', [
        {
          kind: 'flatModifier',
          selector: 'ac',
          label: 'Bonus B',
          type: 'status',
          value: 1,
        },
      ]),
    ];

    const result = applyRuleElements({ items });

    expect(result.modifiersBySelector.get('ac')).toHaveLength(2);
  });

  it("carries a flatModifier element's predicate through onto the Modifier, unevaluated", () => {
    const items = [
      item('Invented Feat', [
        {
          kind: 'flatModifier',
          selector: 'ac',
          label: 'Invented Bonus',
          type: 'circumstance',
          value: 1,
          predicate: 'trait:required',
        },
      ]),
    ];

    // No trait:required in roll options -- if this module evaluated the
    // predicate itself, the modifier would be missing. It is not: the
    // predicate rides along on the Modifier for resolveStatistic to test.
    const result = applyRuleElements({ items });

    expect(result.modifiersBySelector.get('ac')?.[0]?.predicate).toBe('trait:required');
  });

  it('ignores grantItem, choiceSet, rollOption, and inert elements', () => {
    const items = [
      item('Invented Feat', [
        { kind: 'grantItem', packId: 'feats', slug: 'invented-target' },
        { kind: 'rollOption', option: 'feature:invented' },
        {
          kind: 'inert',
          upstreamKind: 'ItemAlteration',
          reason: 'unmapped-element-kind',
        },
      ]),
    ];

    const result = applyRuleElements({ items });

    expect(result.modifiersBySelector.size).toBe(0);
  });
});

describe('applyRuleElements -- damageDice', () => {
  it('groups damage dice by selector', () => {
    const items = [
      item('Invented Flaming Rune', [
        {
          kind: 'damageDice',
          selector: 'strike-damage',
          diceNumber: 1,
          dieFaces: 6,
          damageType: 'fire',
        },
      ]),
    ];

    const result = applyRuleElements({ items });

    expect(result.damageDiceBySelector.get('strike-damage')).toEqual([
      {
        kind: 'damageDice',
        selector: 'strike-damage',
        diceNumber: 1,
        dieFaces: 6,
        damageType: 'fire',
      },
    ]);
  });

  it('drops a damageDice element whose predicate fails, since DamageComponent has nowhere to defer it to', () => {
    const items = [
      item('Invented Sneak Attack', [
        {
          kind: 'damageDice',
          selector: 'strike-damage',
          diceNumber: 1,
          dieFaces: 6,
          predicate: 'condition:flat-footed',
        },
      ]),
    ];

    const withoutCondition = applyRuleElements({ items });
    expect(withoutCondition.damageDiceBySelector.get('strike-damage')).toBeUndefined();

    const withCondition = applyRuleElements({
      items,
      rollOptions: new Set(['condition:flat-footed']),
    });
    expect(withCondition.damageDiceBySelector.get('strike-damage')).toHaveLength(1);
  });

  it("evaluates a damageDice predicate against roll options a rollOption element added, not just the caller's base set", () => {
    const items = [
      item('Invented Feature', [{ kind: 'rollOption', option: 'feature:invented' }]),
      item('Invented Rune', [
        {
          kind: 'damageDice',
          selector: 'strike-damage',
          diceNumber: 1,
          dieFaces: 4,
          predicate: 'feature:invented',
        },
      ]),
    ];

    const result = applyRuleElements({ items });

    expect(result.damageDiceBySelector.get('strike-damage')).toHaveLength(1);
  });
});
