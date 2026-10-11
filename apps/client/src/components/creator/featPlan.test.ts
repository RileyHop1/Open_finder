import type { AncestryEntry, BackgroundEntry, ClassEntry } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import {
  creationSlots,
  featStatus,
  prerequisiteStatus,
  slotFilter,
  trainedSkillsOf,
} from './featPlan.js';

// Everything below is invented (ADR 0013).
const cls = {
  slug: 'vanguard',
  skills: { trainedSkillCount: 2, automaticallyTrained: ['athletics'] },
} as unknown as ClassEntry;
const ancestry = { slug: 'invented-folk' } as unknown as AncestryEntry;
const background = { trainedSkills: ['guild-lore'] } as unknown as BackgroundEntry;

describe('creationSlots', () => {
  it('opens an ancestry feat and a class feat at level 1', () => {
    expect(creationSlots(undefined).map((s) => [s.slot, s.level, s.label])).toEqual([
      ['ancestry', 1, 'Ancestry feat'],
      ['class', 1, 'Class feat'],
    ]);
  });

  it('follows the class’s own advancement when it has one', () => {
    const later = {
      advancement: {
        ancestryFeatLevels: [1],
        classFeatLevels: [2],
        generalFeatLevels: [3],
        skillFeatLevels: [1],
        skillIncreaseLevels: [3],
      },
    } as unknown as ClassEntry;
    expect(creationSlots(later).map((s) => s.slot)).toEqual(['ancestry', 'skill']);
  });
});

describe('slotFilter', () => {
  const [anc, klass] = creationSlots(undefined);

  it('narrows an ancestry feat to the ancestry and a class feat to the class', () => {
    expect(slotFilter(anc!, ancestry, cls)).toEqual({
      category: 'ancestry',
      trait: 'invented-folk',
      maxLevel: 1,
    });
    expect(slotFilter(klass!, ancestry, cls)).toEqual({
      category: 'class',
      trait: 'vanguard',
      maxLevel: 1,
    });
  });

  it('does not narrow by a trait the character has not picked yet', () => {
    expect(slotFilter(anc!, undefined, cls)).toEqual({
      category: 'ancestry',
      maxLevel: 1,
    });
  });
});

describe('prerequisites', () => {
  const trained = trainedSkillsOf(cls, background, ['stealth']);

  it('knows the skills the class, the background and the picks train', () => {
    expect([...trained].sort()).toEqual(['athletics', 'guild-lore', 'stealth']);
  });

  it('checks "trained in" against them, Lores included', () => {
    expect(prerequisiteStatus('trained in Athletics', trained)).toBe('met');
    expect(prerequisiteStatus('trained in Guild Lore', trained)).toBe('met');
    expect(prerequisiteStatus('trained in Arcana', trained)).toBe('unmet');
  });

  it('reads a higher rank as unmet at creation, and anything else as unknown', () => {
    expect(prerequisiteStatus('expert in Athletics', trained)).toBe('unmet');
    expect(prerequisiteStatus('redemption cause', trained)).toBe('unknown');
    expect(prerequisiteStatus('low-light vision', trained)).toBe('unknown');
  });

  it('combines a feat’s prerequisites: unmet beats unknown beats met', () => {
    expect(featStatus([], trained)).toBe('met');
    expect(featStatus(['trained in Athletics'], trained)).toBe('met');
    expect(featStatus(['trained in Athletics', 'redemption cause'], trained)).toBe(
      'unknown',
    );
    expect(featStatus(['redemption cause', 'trained in Arcana'], trained)).toBe('unmet');
  });
});
