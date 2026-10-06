// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import GiveMenu from './GiveMenu.vue';

const recipients = [
  { id: 'ada', name: 'Ada' },
  { id: 'party', name: 'Party stash' },
];

describe('GiveMenu (an item)', () => {
  it('offers every recipient, and gives a single item without asking how many', async () => {
    const wrapper = mount(GiveMenu, { props: { recipients, label: 'Rope' } });
    expect(wrapper.findAll('option').map((o) => o.text())).toEqual([
      'Ada',
      'Party stash',
    ]);
    expect(wrapper.find('input[aria-label="How many to give"]').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('give')).toEqual([[{ to: 'ada' }]]);
  });

  it('asks how many for a stack, defaulting to the whole stack, and clamps it', async () => {
    const wrapper = mount(GiveMenu, {
      props: { recipients, label: 'Arrows', maxQuantity: 20 },
    });
    const input = wrapper.get('input[aria-label="How many to give"]');
    expect((input.element as HTMLInputElement).value).toBe('20');
    await input.setValue('5');
    await wrapper.get('select').setValue('party');
    await wrapper.get('form').trigger('submit');
    await input.setValue('99');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('give')).toEqual([
      [{ to: 'party', quantity: 5 }],
      [{ to: 'party', quantity: 20 }],
    ]);
  });

  it('cancels with the button or Escape', async () => {
    const wrapper = mount(GiveMenu, { props: { recipients, label: 'Rope' } });
    await wrapper.findAll('button')[1]?.trigger('click');
    await wrapper.get('form').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('cancel')).toHaveLength(2);
  });
});

describe('GiveMenu (coins)', () => {
  it('gives the typed denominations, and nothing when they are empty or zero', async () => {
    const wrapper = mount(GiveMenu, {
      props: { recipients, label: 'coins', coins: true },
    });
    await wrapper.get('form').trigger('submit');
    await wrapper.get('input[aria-label="gp to give"]').setValue('0');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('give')).toBeUndefined();

    await wrapper.get('input[aria-label="gp to give"]').setValue('3');
    await wrapper.get('input[aria-label="sp to give"]').setValue('5');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('give')).toEqual([[{ to: 'ada', coins: { gp: 3, sp: 5 } }]]);
  });
});
