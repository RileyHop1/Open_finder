// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CREATOR_STEPS,
  MARTIAL_CLASS_SLUGS,
  clearDraft,
  emptyDraft,
  loadDraft,
  nextStep,
  previewOf,
  previousStep,
  saveDraft,
} from './creatorModel.js';

beforeEach(() => {
  localStorage.clear();
});

describe('steps', () => {
  it('runs ancestry to review, and stops at both ends', () => {
    expect(CREATOR_STEPS.map((s) => s.id)).toEqual([
      'ancestry',
      'background',
      'class',
      'class-choices',
      'attributes',
      'skills',
      'feats',
      'equipment',
      'review',
    ]);
    expect(nextStep('ancestry')).toBe('background');
    expect(nextStep('review')).toBe('review');
    expect(previousStep('background')).toBe('ancestry');
    expect(previousStep('ancestry')).toBe('ancestry');
  });
});

describe('the saved draft', () => {
  it('starts empty when nothing is saved', () => {
    expect(loadDraft()).toEqual(emptyDraft());
    expect(emptyDraft().step).toBe('ancestry');
  });

  it('round-trips, and is forgotten on request', () => {
    const draft = { ...emptyDraft(), name: 'Valeria', step: 'class' as const };
    saveDraft(draft);
    expect(loadDraft()).toEqual(draft);
    clearDraft();
    expect(loadDraft()).toEqual(emptyDraft());
  });

  it('starts over rather than failing on text that is not a draft', () => {
    localStorage.setItem('hearthtable.creatorDraft', '{ not json');
    expect(loadDraft()).toEqual(emptyDraft());
    localStorage.setItem('hearthtable.creatorDraft', JSON.stringify({ step: 'nowhere' }));
    expect(loadDraft()).toEqual(emptyDraft());
  });
});

describe('previewOf', () => {
  it('shows an empty draft as an unnamed level 1 character with no numbers yet', () => {
    const { actor, warnings } = previewOf(emptyDraft());
    expect(actor.name).toBe('New character');
    expect(warnings).toEqual([]);
    expect(actor.system).toMatchObject({ level: 1, attributes: { str: 0, con: 0 } });
  });

  it('uses the name, and replays the draft’s boosts into the attributes', () => {
    const draft = emptyDraft();
    draft.name = '  Valeria ';
    draft.build.boosts = [{ level: 1, source: 'free', attributes: ['str', 'con'] }];
    const { actor } = previewOf(draft);
    expect(actor.name).toBe('Valeria');
    expect(actor.system).toMatchObject({ attributes: { str: 1, con: 1 } });
  });

  it('carries warnings through, and still shows the character', () => {
    const draft = emptyDraft();
    draft.build.boosts = [{ level: 1, source: 'free', attributes: ['str', 'str'] }];
    const { actor, warnings } = previewOf(draft);
    expect(warnings).toEqual([
      { kind: 'duplicate-boost', level: 1, source: 'free', attribute: 'str' },
    ]);
    expect(actor.system).toMatchObject({ attributes: { str: 2 } });
  });

  it('starts at full health: ancestry HP plus (class HP + Con) per level', () => {
    const draft = emptyDraft();
    draft.build.boosts = [{ level: 1, source: 'free', attributes: ['con'] }];
    const { actor } = previewOf(draft, {
      ancestry: { hp: 8, speed: 30 } as never,
      class: {
        hpPerLevel: 10,
        keyAttributeOptions: ['str'],
        proficiencies: undefined,
        skills: { trainedSkillCount: 0, automaticallyTrained: [] },
      } as never,
    });
    // 8 + (10 + 1) * 1 = 19
    expect(actor.system).toMatchObject({ hp: { current: 19 }, speed: 30 });
  });
});

describe('MARTIAL_CLASS_SLUGS', () => {
  it('is the seven martial classes of milestone 8(a)', () => {
    expect([...MARTIAL_CLASS_SLUGS].sort()).toEqual([
      'barbarian',
      'fighter',
      'investigator',
      'monk',
      'ranger',
      'rogue',
      'swashbuckler',
    ]);
  });
});
