import type { ClassFeatureEntry } from '@hearthtable/pf2e';
import { classFeatureEntrySchema } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { choicesDue } from './classChoices.js';

const NOW = '2026-10-01T00:00:00.000Z';

// Everything below is invented (ADR 0013).
function feature(
  slug: string,
  extra: Partial<Record<string, unknown>> = {},
): ClassFeatureEntry {
  return classFeatureEntrySchema.parse({
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'classFeatures',
    slug,
    name: slug,
    kind: 'classFeature',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
    classSlugs: ['invented'],
    level: 1,
    ...extra,
  });
}

const choice = (prefix: string, values: string[], grants = true) => ({
  kind: 'choiceSet',
  prompt: `Choose ${prefix}`,
  choices: values.map((v) => ({ label: v, value: v })),
  rollOptionPrefix: prefix,
  ...(grants ? { grantsFromPackId: 'classFeatures' } : {}),
});

const instinct = feature('instinct', {
  ruleElements: [choice('instinct', ['wolf', 'bear'])],
});
const wolf = feature('wolf', { tags: ['instinct'] });
const bear = feature('bear', {
  tags: ['instinct'],
  ruleElements: [choice('bear-trait', ['claws', 'teeth'], false)],
});

describe('choicesDue', () => {
  it('asks the level 1 questions, with the feature each option grants', () => {
    const { choices } = choicesDue([instinct, wolf, bear], {});
    expect(choices).toHaveLength(1);
    expect(choices[0]?.element.rollOptionPrefix).toBe('instinct');
    expect(choices[0]?.options.map((o) => o.feature?.slug)).toEqual(['wolf', 'bear']);
    expect(choices[0]?.chosen).toBeUndefined();
  });

  it('follows the pick made into the question it asks', () => {
    const { choices } = choicesDue([instinct, wolf, bear], { instinct: 'bear' });
    expect(choices.map((c) => c.element.rollOptionPrefix)).toEqual([
      'instinct',
      'bear-trait',
    ]);
  });

  it('ignores features of a later level and the alternatives nobody picked', () => {
    const late = feature('late', { level: 5, ruleElements: [choice('late', ['a'])] });
    const { choices } = choicesDue([late, instinct, wolf, bear], { instinct: 'wolf' });
    expect(choices.map((c) => c.element.rollOptionPrefix)).toEqual(['instinct']);
  });

  it('reports the answer even when the feature does not offer it', () => {
    const { choices } = choicesDue([instinct, wolf, bear], { instinct: 'dragon' });
    expect(choices[0]?.chosen).toBe('dragon');
  });

  it('lists a feature whose choice the importer could not map', () => {
    const cause = feature('cause', {
      ruleElements: [
        { kind: 'inert', upstreamKind: 'ChoiceSet', reason: 'unsupported-choice-filter' },
      ],
    });
    expect(choicesDue([cause], {}).unautomated).toEqual(['cause']);
  });
});
