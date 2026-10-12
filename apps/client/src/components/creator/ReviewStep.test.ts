// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ReviewStep from './ReviewStep.vue';
import { emptyDraft, previewOf } from './creatorModel.js';

const mountStep = (props: Record<string, unknown> = {}) => {
  const draft = emptyDraft();
  draft.name = 'Valeria';
  const { actor, warnings } = previewOf(draft);
  return mount(ReviewStep, {
    props: {
      draft,
      warnings,
      actor,
      names: {},
      creating: false,
      failure: undefined,
      ...props,
    } as never,
  });
};

describe('ReviewStep', () => {
  it('says what has not been chosen yet, in words', () => {
    const wrapper = mountStep();
    expect(wrapper.get('.summary').text()).toContain('Class');
    expect(wrapper.text()).toContain('Not chosen yet');
    expect(wrapper.text()).toContain('Strength +0');
  });

  it('names the picked entries and summarises feats, choices, skills and gear', () => {
    const draft = emptyDraft();
    draft.build.class = { packId: 'classes', slug: 'fighter' };
    draft.build.trainedSkills = ['arcana'];
    draft.build.classChoices = { stance: 'low' };
    draft.build.feats = [
      { slot: 'class', level: 1, feat: { packId: 'feats', slug: 'sudden-charge' } },
    ];
    draft.equipment = [
      { packId: 'equipment', slug: 'rope', name: 'Rope', priceInCopper: 10, quantity: 2 },
    ];
    const { actor, warnings } = previewOf(draft);
    const wrapper = mountStep({ draft, actor, warnings, names: { class: 'Fighter' } });
    const text = wrapper.get('.summary').text().replace(/\s+/g, ' ');
    expect(text).toContain('Fighter');
    expect(text).toContain('Arcana');
    expect(text).toContain('Stance: Low');
    expect(text).toContain('Class: Sudden Charge');
    expect(text).toContain('Rope ×2 (spent 2 sp)');
  });

  it('lists the things to check without blocking Create', () => {
    const wrapper = mountStep({
      warnings: [{ kind: 'too-many-trained-skills', chosen: 5, allowed: 4 }],
    });
    expect(wrapper.get('.notes').text()).toContain('5 skills chosen but only 4 allowed.');
    expect(wrapper.get('.create').attributes('disabled')).toBeUndefined();
  });

  it('notes an unnamed character, emits create, and disables the button while creating', async () => {
    const draft = emptyDraft();
    const { actor, warnings } = previewOf(draft);
    const wrapper = mountStep({ draft, actor, warnings });
    expect(wrapper.text()).toContain('no name yet');
    await wrapper.get('.create').trigger('click');
    expect(wrapper.emitted('create')).toHaveLength(1);

    const busy = mountStep({ creating: true });
    expect(busy.get('.create').attributes('disabled')).toBeDefined();
    expect(busy.get('.create').text()).toBe('Creating…');
  });

  it('shows why a creation failed', () => {
    const wrapper = mountStep({ failure: 'refused. Nothing was created.' });
    expect(wrapper.get('[role="alert"]').text()).toContain('Nothing was created');
  });
});
