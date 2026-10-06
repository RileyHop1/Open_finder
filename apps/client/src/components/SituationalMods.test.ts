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

/** The saved list lives in a dropdown, so open it first. */
async function openList(wrapper: ReturnType<typeof mountMods>) {
  await wrapper.get('.mods-toggle').trigger('click');
}

describe('SituationalMods', () => {
  it('keeps a fixed shape: the total, the add row and one button, with the list closed', () => {
    const wrapper = mountMods();
    expect(wrapper.get('.mods-total').text()).toBe('Mods +2');
    expect(wrapper.get('.mods-toggle').text()).toBe('Saved (2) ▾');
    expect(wrapper.get('.mods-toggle').attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.chip').exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Modifier value"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('lists every saved modifier in the dropdown once opened', async () => {
    const wrapper = mountMods();
    await openList(wrapper);
    expect(wrapper.get('.mods-toggle').attributes('aria-expanded')).toBe('true');
    expect(wrapper.findAll('.chip').map((c) => c.text())).toEqual([
      '+2 Flanking ×',
      '−1 Situational ×',
    ]);
    wrapper.unmount();
  });

  it('says so when none are saved', async () => {
    const wrapper = mountMods([]);
    await openList(wrapper);
    expect(wrapper.get('.mods-empty').text()).toBe('None saved.');
    wrapper.unmount();
  });

  it('switches a modifier on or off without touching the others', async () => {
    const wrapper = mountMods();
    await openList(wrapper);
    await wrapper.findAll('input[type="checkbox"]')[0]?.setValue(false);
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([
      { value: 2, label: 'Flanking', active: false },
      mods[1],
    ]);
    wrapper.unmount();
  });

  it('removes one modifier by its button', async () => {
    const wrapper = mountMods();
    await openList(wrapper);
    await wrapper.get('button[aria-label="Remove +2 Flanking"]').trigger('click');
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([mods[1]]);
    wrapper.unmount();
  });

  it('adds a new modifier from the always-visible row, switched on, and clears it', async () => {
    const wrapper = mountMods([]);
    await wrapper.get('input[aria-label="Modifier value"]').setValue('2');
    await wrapper.get('input[aria-label="Modifier label"]').setValue('  Bless ');
    await wrapper.get('.mods-add button').trigger('click');
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
    await wrapper.get('.mods-add button').trigger('click');
    await wrapper.get('input[aria-label="Modifier value"]').setValue('0');
    await wrapper.get('.mods-add button').trigger('click');
    expect(wrapper.emitted('update')).toBeUndefined();
    wrapper.unmount();
  });

  it('closes on Escape and returns focus to its button', async () => {
    const wrapper = mountMods();
    await openList(wrapper);
    await wrapper.get('.mods').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.mods-panel').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('.mods-toggle').element);
    wrapper.unmount();
  });
});
