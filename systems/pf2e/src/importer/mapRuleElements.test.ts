import { describe, expect, it } from 'vitest';

import { mapEntryRuleElements } from './mapRuleElements.js';

// Synthetic, invented upstream-shaped rule elements throughout (ADR 0013).

describe('mapEntryRuleElements -- no automation', () => {
  it('maps an absent rules field to no elements and no downgrades', () => {
    expect(mapEntryRuleElements(undefined)).toEqual({ elements: [], downgrades: [] });
  });

  it('maps a null rules field the same way', () => {
    expect(mapEntryRuleElements(null)).toEqual({ elements: [], downgrades: [] });
  });

  it('maps an empty rules array the same way', () => {
    expect(mapEntryRuleElements([])).toEqual({ elements: [], downgrades: [] });
  });
});

describe('mapEntryRuleElements -- a mix of mappable and unmappable elements', () => {
  it('keeps every element, in order, and collects only the inert ones as downgrades', () => {
    const result = mapEntryRuleElements([
      { key: 'RollOption', option: 'raging' },
      { key: 'ItemAlteration', mode: 'add' }, // unmapped kind
      { key: 'FlatModifier', selector: 'ac', type: 'untyped', value: '@actor.level' }, // formula value
    ]);

    expect(result.elements).toEqual([
      { kind: 'rollOption', option: 'raging' },
      { kind: 'inert', upstreamKind: 'ItemAlteration', reason: 'unmapped-element-kind' },
      { kind: 'inert', upstreamKind: 'FlatModifier', reason: 'formula-value' },
    ]);
    expect(result.downgrades).toEqual([
      { upstreamKind: 'ItemAlteration', reason: 'unmapped-element-kind' },
      { upstreamKind: 'FlatModifier', reason: 'formula-value' },
    ]);
  });

  it('produces no downgrades when every element maps successfully', () => {
    const result = mapEntryRuleElements([
      { key: 'RollOption', option: 'raging' },
      { key: 'RollOption', option: 'enlarged' },
    ]);
    expect(result.downgrades).toEqual([]);
    expect(result.elements).toHaveLength(2);
  });

  it('every downgrade is also present in elements -- it is a view, not a second source of truth', () => {
    const result = mapEntryRuleElements([{ key: 'Aura', radius: 10 }]);
    expect(result.elements).toContainEqual({
      kind: 'inert',
      upstreamKind: 'Aura',
      reason: 'unmapped-element-kind',
    });
    expect(result.downgrades).toContainEqual({
      upstreamKind: 'Aura',
      reason: 'unmapped-element-kind',
    });
  });
});

describe('mapEntryRuleElements -- malformed rules value', () => {
  it('treats a non-array rules value as one malformed-rules-array downgrade', () => {
    const result = mapEntryRuleElements('not an array');
    expect(result).toEqual({
      elements: [
        { kind: 'inert', upstreamKind: 'unknown', reason: 'malformed-rules-array' },
      ],
      downgrades: [{ upstreamKind: 'unknown', reason: 'malformed-rules-array' }],
    });
  });
});
