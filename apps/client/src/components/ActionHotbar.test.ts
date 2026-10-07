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
    dice?: string;
  })[];
  bar[0] = { name: 'Stab', text: 'Sneak attack', cost: 1, dice: '1d6' };
  bar[9] = { name: 'Block', text: 'Shield Block', cost: 'reaction' };
  return bar;
};

const mountBar = (canSave = false) =>
  mount(ActionHotbar, { props: { slots: slots(), canSave }, attachTo: document.body });

const openDetails = (wrapper: ReturnType<typeof mountBar>, label: string) =>
  wrapper.get(`button[aria-label="Details for ${label}"]`).trigger('click');

describe('ActionHotbar', () => {
  it('shows all ten slots with their keys, filled ones by name only, empty ones faint', () => {
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
    // The description, cost and controls are in the dropdown, closed until asked for.
    expect(wrapper.text()).not.toContain('Sneak attack');
    expect(wrapper.find('.details').exists()).toBe(false);
    wrapper.unmount();
  });

  it('loads a slot when its name is clicked', async () => {
    const wrapper = mountBar();
    await wrapper.get('button[aria-label="Load Block, slot 0"]').trigger('click');
    expect(wrapper.emitted('load')).toEqual([[9]]);
    wrapper.unmount();
  });

  it('shows what a slot does, its cost and dice, in its dropdown', async () => {
    const wrapper = mountBar();
    await openDetails(wrapper, 'Stab, slot 1');
    const details = wrapper.get('.details');
    expect(details.text()).toContain('Sneak attack · 1d6');
    expect(details.text()).toContain('Cost: ◆');
    await openDetails(wrapper, 'Stab, slot 1');
    expect(wrapper.find('.details').exists()).toBe(false);
    await openDetails(wrapper, 'Block, slot 0');
    expect(wrapper.get('.details').text()).toContain('Cost: ↺ Reaction');
    wrapper.unmount();
  });

  it('removes a slot from its dropdown', async () => {
    const wrapper = mountBar();
    await openDetails(wrapper, 'Stab, slot 1');
    const remove = wrapper.findAll('.details button').find((b) => b.text() === 'Remove');
    await remove?.trigger('click');
    expect(wrapper.emitted('remove')).toEqual([[0]]);
    expect(wrapper.find('.details').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renames in the dropdown with Enter, trimmed, and ignores an empty name', async () => {
    const wrapper = mountBar();
    await openDetails(wrapper, 'Stab, slot 1');
    await wrapper
      .findAll('.details button')
      .find((b) => b.text() === 'Rename')
      ?.trigger('click');
    const input = wrapper.get('input[aria-label="Name for slot 1"]');
    await input.setValue('  Backstab ');
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('rename')).toEqual([[0, 'Backstab']]);

    await wrapper
      .findAll('.details button')
      .find((b) => b.text() === 'Rename')
      ?.trigger('click');
    await wrapper.get('input[aria-label="Name for slot 1"]').setValue('   ');
    await wrapper.get('input[aria-label="Name for slot 1"]').trigger('keydown.enter');
    expect(wrapper.emitted('rename')).toHaveLength(1);
    wrapper.unmount();
  });

  it('changes a slot’s hotkey from the dropdown, offering to swap with an occupied key', async () => {
    const wrapper = mountBar();
    await openDetails(wrapper, 'Stab, slot 1');
    const select = wrapper.get('select[aria-label="Hotkey for Stab"]');
    expect(select.findAll('option').map((o) => o.text())).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '0 (swap with Block)',
    ]);
    await select.setValue('4');
    expect(wrapper.emitted('move')).toEqual([[0, 4]]);
    wrapper.unmount();
  });

  it('closes the dropdown on Escape', async () => {
    const wrapper = mountBar();
    await openDetails(wrapper, 'Stab, slot 1');
    await wrapper.get('li.slot').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.details').exists()).toBe(false);
    wrapper.unmount();
  });

  it('offers + on empty slots only when the form has something to save', async () => {
    expect(mountBar(false).find('button[aria-label="Save to slot 3"]').exists()).toBe(
      false,
    );
    const wrapper = mountBar(true);
    expect(wrapper.find('button[aria-label="Save to slot 1"]').exists()).toBe(false);
    await wrapper.get('button[aria-label="Save to slot 3"]').trigger('click');
    expect(wrapper.emitted('saveTo')).toEqual([[2]]);
    wrapper.unmount();
  });
});
