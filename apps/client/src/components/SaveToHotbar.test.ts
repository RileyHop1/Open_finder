// @vitest-environment jsdom
import { emptyHotbar } from '@hearthtable/core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SaveToHotbar from './SaveToHotbar.vue';

const mountSave = (canSave = true) => {
  const slots = emptyHotbar() as (null | { name: string; text: string; cost: 1 })[];
  slots[1] = { name: 'Old', text: 'x', cost: 1 };
  return mount(SaveToHotbar, {
    props: { slots, suggestedName: 'Sneak attack', canSave },
    attachTo: document.body,
  });
};

describe('SaveToHotbar', () => {
  it('is disabled with nothing in the form to save', () => {
    const wrapper = mountSave(false);
    expect(wrapper.get('.save-toggle').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('opens with the suggested name and ten labelled slots, saying what a filled one replaces', async () => {
    const wrapper = mountSave();
    await wrapper.get('.save-toggle').trigger('click');
    expect(
      (wrapper.get('input[aria-label="Name"]').element as HTMLInputElement).value,
    ).toBe('Sneak attack');
    expect(wrapper.findAll('.save-slots button')).toHaveLength(10);
    expect(wrapper.find('button[aria-label="Slot 2: replace Old"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Slot 1: empty"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('saves under the chosen slot with the typed name, then closes', async () => {
    const wrapper = mountSave();
    await wrapper.get('.save-toggle').trigger('click');
    await wrapper.get('input[aria-label="Name"]').setValue('  Backstab ');
    await wrapper.get('button[aria-label="Slot 3: empty"]').trigger('click');
    expect(wrapper.emitted('save')).toEqual([[2, 'Backstab']]);
    expect(wrapper.find('.save-panel').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves to the first empty slot on Enter', async () => {
    const wrapper = mountSave();
    await wrapper.get('.save-toggle').trigger('click');
    await wrapper.get('input[aria-label="Name"]').trigger('keydown.enter');
    expect(wrapper.emitted('save')).toEqual([[0, 'Sneak attack']]);
    wrapper.unmount();
  });

  it('does not save without a name', async () => {
    const wrapper = mountSave();
    await wrapper.get('.save-toggle').trigger('click');
    await wrapper.get('input[aria-label="Name"]').setValue('   ');
    await wrapper.get('button[aria-label="Slot 3: empty"]').trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();
    wrapper.unmount();
  });

  it('closes on Escape and returns focus to its button', async () => {
    const wrapper = mountSave();
    await wrapper.get('.save-toggle').trigger('click');
    await wrapper.get('.save').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.save-panel').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('.save-toggle').element);
    wrapper.unmount();
  });
});
