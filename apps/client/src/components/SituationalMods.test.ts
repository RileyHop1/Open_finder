// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SituationalMods from './SituationalMods.vue';

const mods = [
  { value: 2, label: 'Flanking', active: true },
  { value: -1, active: false },
];

const mountMods = (modifiers = mods) =>
  mount(SituationalMods, { props: { modifiers }, attachTo: document.body });

describe('SituationalMods', () => {
  it('shows the sum of the switched-on modifiers on its button, closed until clicked', async () => {
    const wrapper = mountMods();
    expect(wrapper.get('.mods-toggle').text()).toBe('Mods +2');
    expect(wrapper.find('.mods-panel').exists()).toBe(false);
    await wrapper.get('.mods-toggle').trigger('click');
    expect(wrapper.get('.mods-toggle').attributes('aria-expanded')).toBe('true');
    expect(wrapper.text()).toContain('+2 Flanking');
    expect(wrapper.text()).toContain('−1 Situational');
    wrapper.unmount();
  });

  it('switches a modifier on or off without touching the others', async () => {
    const wrapper = mountMods();
    await wrapper.get('.mods-toggle').trigger('click');
    await wrapper.findAll('input[type="checkbox"]')[0]?.setValue(false);
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([
      { value: 2, label: 'Flanking', active: false },
      mods[1],
    ]);
    wrapper.unmount();
  });

  it('removes one modifier by its button', async () => {
    const wrapper = mountMods();
    await wrapper.get('.mods-toggle').trigger('click');
    await wrapper.get('button[aria-label="Remove +2 Flanking"]').trigger('click');
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([mods[1]]);
    wrapper.unmount();
  });

  it('adds a new modifier, switched on, with an optional label, and clears the row', async () => {
    const wrapper = mountMods([]);
    await wrapper.get('.mods-toggle').trigger('click');
    await wrapper.get('input[aria-label="Modifier value"]').setValue('2');
    await wrapper.get('input[aria-label="Modifier label"]').setValue('  Bless ');
    await wrapper.findAll('.mods-add button')[0]?.trigger('click');
    await wrapper.get('input[aria-label="Modifier value"]').setValue('-1');
    await wrapper.get('input[aria-label="Modifier value"]').trigger('keydown.enter');
    expect(wrapper.emitted('update')).toEqual([
      [[{ value: 2, label: 'Bless', active: true }]],
      [[{ value: -1, active: true }]],
    ]);
    wrapper.unmount();
  });

  it('ignores a blank or zero value', async () => {
    const wrapper = mountMods([]);
    await wrapper.get('.mods-toggle').trigger('click');
    await wrapper.findAll('.mods-add button')[0]?.trigger('click');
    await wrapper.get('input[aria-label="Modifier value"]').setValue('0');
    await wrapper.findAll('.mods-add button')[0]?.trigger('click');
    expect(wrapper.emitted('update')).toBeUndefined();
    wrapper.unmount();
  });

  it('closes on Escape and returns focus to its button', async () => {
    const wrapper = mountMods();
    await wrapper.get('.mods-toggle').trigger('click');
    await wrapper.get('.mods').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.mods-panel').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('.mods-toggle').element);
    wrapper.unmount();
  });
});
