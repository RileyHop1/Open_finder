// @vitest-environment jsdom
import { emptyHotbar } from '@hearthtable/core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ActionHotbar from './ActionHotbar.vue';

const slots = () => {
  const bar = emptyHotbar() as (null | {
    name: string;
    text: string;
    cost: 1 | 'reaction';
  })[];
  bar[0] = { name: 'Stab', text: 'Sneak attack', cost: 1 };
  bar[9] = { name: 'Block', text: 'Shield Block', cost: 'reaction' };
  return bar;
};

const mountBar = () =>
  mount(ActionHotbar, { props: { slots: slots() }, attachTo: document.body });

describe('ActionHotbar', () => {
  it('shows all ten slots with their keys, filled ones named, empty ones faint', () => {
    const wrapper = mountBar();
    expect(wrapper.findAll('li.slot')).toHaveLength(10);
    expect(wrapper.findAll('li.slot.empty')).toHaveLength(8);
    expect(
      wrapper
        .findAll('.key')
        .map((k) => k.text())
        .join(''),
    ).toBe('1234567890');
    expect(wrapper.text()).toContain('Stab');
    expect(wrapper.text()).toContain('Block');
    wrapper.unmount();
  });

  it('loads a slot when it is clicked', async () => {
    const wrapper = mountBar();
    await wrapper.get('button[aria-label="Load Block, slot 0"]').trigger('click');
    expect(wrapper.emitted('load')).toEqual([[9]]);
    wrapper.unmount();
  });

  it('removes a slot by its own button', async () => {
    const wrapper = mountBar();
    await wrapper.get('button[aria-label="Remove Stab from slot 1"]').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([[0]]);
    wrapper.unmount();
  });

  it('renames in place with F2 and Enter, trims, and ignores an empty name', async () => {
    const wrapper = mountBar();
    await wrapper
      .get('button[aria-label="Load Stab, slot 1"]')
      .trigger('keydown', { key: 'F2' });
    const input = wrapper.get('input[aria-label="Name for slot 1"]');
    await input.setValue('  Backstab ');
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('rename')).toEqual([[0, 'Backstab']]);

    await wrapper.get('button[aria-label="Load Stab, slot 1"]').trigger('dblclick');
    await wrapper.get('input[aria-label="Name for slot 1"]').setValue('   ');
    await wrapper.get('input[aria-label="Name for slot 1"]').trigger('keydown.enter');
    expect(wrapper.emitted('rename')).toHaveLength(1);
    wrapper.unmount();
  });

  it('cancels a rename with Escape', async () => {
    const wrapper = mountBar();
    await wrapper.get('button[aria-label="Load Stab, slot 1"]').trigger('dblclick');
    await wrapper
      .get('input[aria-label="Name for slot 1"]')
      .trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('input[aria-label="Name for slot 1"]').exists()).toBe(false);
    expect(wrapper.emitted('rename')).toBeUndefined();
    wrapper.unmount();
  });
});
