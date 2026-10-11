// @vitest-environment jsdom
import type { BackgroundEntry, ClassEntry } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SkillsStep from './SkillsStep.vue';

// Everything below is invented (ADR 0013).
const cls = {
  name: 'Invented Vanguard',
  keyAttributeOptions: ['str'],
  skills: { trainedSkillCount: 2, automaticallyTrained: ['athletics'] },
} as unknown as ClassEntry;
const background = {
  name: 'Invented Trade',
  boostOptions: ['str'],
  trainedSkills: ['guild-lore'],
} as unknown as BackgroundEntry;

const mountStep = (props: Record<string, unknown> = {}) =>
  mount(SkillsStep, {
    props: {
      entries: { class: cls, background },
      boostPicks: {},
      keyAttribute: undefined,
      picked: [],
      ...props,
    } as never,
  });

describe('SkillsStep', () => {
  it('shows the skills the class and background train as already on, and the rest as toggles', () => {
    const wrapper = mountStep();
    expect(wrapper.findAll('.skills .fixed').map((f) => f.text())).toEqual([
      '✓ Athletics (trained by your class)',
    ]);
    expect(wrapper.findAll('.skills .toggle')).toHaveLength(15);
    expect(wrapper.text()).toContain('Guild Lore (trained by your background)');
  });

  it('counts the picks against the class’s number plus Intelligence', () => {
    const none = mountStep();
    expect(none.get('.count').text()).toContain('0 of 2 chosen, 2 to choose');

    const smart = mountStep({ boostPicks: { free: ['int', 'str'] }, picked: ['arcana'] });
    expect(smart.get('.count').text()).toContain('1 of 3 chosen, 2 to choose');
  });

  it('emits the skill on a click, and marks a picked one', async () => {
    const wrapper = mountStep({ picked: ['arcana'] });
    const arcana = wrapper
      .findAll('.skills .toggle')
      .find((b) => b.text().startsWith('Arcana'));
    expect(arcana?.attributes('aria-pressed')).toBe('true');
    await wrapper.findAll('.skills .toggle')[0]?.trigger('click');
    expect(wrapper.emitted('toggle')).toEqual([['acrobatics']]);
  });

  it('adds a Lore by name, and lists a picked Lore so it can be removed', async () => {
    const wrapper = mountStep({ picked: ['farming-lore'] });
    expect(wrapper.get('.lore .toggle').attributes('aria-label')).toBe(
      'Remove Farming Lore',
    );
    await wrapper.get('.lore .toggle').trigger('click');
    expect(wrapper.emitted('toggle')?.[0]).toEqual(['farming-lore']);

    await wrapper.get('.add-lore input').setValue('Academia');
    await wrapper.get('.add-lore').trigger('submit');
    expect(wrapper.emitted('toggle')?.[1]).toEqual(['academia-lore']);
  });

  it('says so when there are too many, and still keeps them (ADR 0023)', () => {
    const wrapper = mountStep({ picked: ['arcana', 'nature', 'stealth'] });
    expect(wrapper.text()).toContain('3 chosen but only 2 allowed');
  });

  it('lets skills be chosen before a class is', () => {
    const wrapper = mountStep({ entries: {} });
    expect(wrapper.text()).toContain('Pick a class');
    expect(wrapper.findAll('.skills .toggle')).toHaveLength(16);
  });
});
