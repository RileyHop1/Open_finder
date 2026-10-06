// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SituationalMods from './SituationalMods.vue';

const mods = [
  { value: 2, label: 'Flanking', active: true },
  { value: -1, active: false },
];

const mountMods = (modifiers = mods) => mount(SituationalMods, { props: { modifiers } });

describe('SituationalMods', () => {
  it('is always visible: the total, every saved modifier as a chip, and the add row', () => {
    const wrapper = mountMods();
    expect(wrapper.get('.mods-total').text()).toBe('Mods +2');
    expect(wrapper.findAll('.chip').map((c) => c.text())).toEqual([
      '+2 Flanking ×',
      '−1 Situational ×',
    ]);
    expect(wrapper.find('input[aria-label="Modifier value"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-expanded]').exists()).toBe(false);
  });

  it('switches a modifier on or off without touching the others', async () => {
    const wrapper = mountMods();
    await wrapper.findAll('input[type="checkbox"]')[0]?.setValue(false);
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([
      { value: 2, label: 'Flanking', active: false },
      mods[1],
    ]);
  });

  it('removes one modifier by its button', async () => {
    const wrapper = mountMods();
    await wrapper.get('button[aria-label="Remove +2 Flanking"]').trigger('click');
    expect(wrapper.emitted('update')?.[0]?.[0]).toEqual([mods[1]]);
  });

  it('adds a new modifier, switched on, with an optional label, and clears the row', async () => {
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
  });

  it('ignores a blank or zero value', async () => {
    const wrapper = mountMods([]);
    await wrapper.get('.mods-add button').trigger('click');
    await wrapper.get('input[aria-label="Modifier value"]').setValue('0');
    await wrapper.get('.mods-add button').trigger('click');
    expect(wrapper.emitted('update')).toBeUndefined();
  });
});
