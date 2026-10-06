// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import CoinsRow from './CoinsRow.vue';

const coins = { pp: 1, gp: 12, sp: 5, cp: 0 };
const mountRow = (editable = true) => mount(CoinsRow, { props: { coins, editable } });

describe('CoinsRow', () => {
  it('shows all four denominations, including a zero', () => {
    const wrapper = mountRow();
    expect(wrapper.findAll('.coin').map((c) => c.text())).toEqual([
      'pp1',
      'gp12',
      'sp5',
      'cp0',
    ]);
  });

  it('has no form for a viewer who cannot edit', () => {
    expect(mountRow(false).find('form').exists()).toBe(false);
  });

  it('adds what was typed, in any denominations, and clears the form', async () => {
    const wrapper = mountRow();
    await wrapper.get('input[aria-label="gp to add or spend"]').setValue('2');
    await wrapper.get('input[aria-label="cp to add or spend"]').setValue('7');
    await wrapper.findAll('.adjust button')[0]?.trigger('click');
    expect(wrapper.emitted('adjust')).toEqual([[{ gp: 2, cp: 7 }]]);
    expect(
      (wrapper.get('input[aria-label="gp to add or spend"]').element as HTMLInputElement)
        .value,
    ).toBe('');
  });

  it('spends as negative amounts', async () => {
    const wrapper = mountRow();
    await wrapper.get('input[aria-label="sp to add or spend"]').setValue('3');
    await wrapper.findAll('.adjust button')[1]?.trigger('click');
    expect(wrapper.emitted('adjust')).toEqual([[{ sp: -3 }]]);
  });

  it('offers Give… only with someone to give to, and passes the choice up', async () => {
    expect(mountRow().text()).not.toContain('Give…');
    const wrapper = mount(CoinsRow, {
      props: {
        coins,
        editable: true,
        recipients: [{ id: 'party', name: 'Party stash' }],
      },
    });
    await wrapper.findAll('.adjust button')[2]?.trigger('click');
    await wrapper.get('input[aria-label="gp to give"]').setValue('2');
    await wrapper.get('form[aria-label="Give coins"]').trigger('submit');
    expect(wrapper.emitted('give')).toEqual([['party', { gp: 2 }]]);
    expect(wrapper.find('form[aria-label="Give coins"]').exists()).toBe(false);
  });

  it('sends nothing for an empty form, a zero, or a fraction', async () => {
    const wrapper = mountRow();
    await wrapper.findAll('.adjust button')[0]?.trigger('click');
    await wrapper.get('input[aria-label="gp to add or spend"]').setValue('0');
    await wrapper.findAll('.adjust button')[1]?.trigger('click');
    await wrapper.get('input[aria-label="gp to add or spend"]').setValue('1.5');
    await wrapper.findAll('.adjust button')[0]?.trigger('click');
    expect(wrapper.emitted('adjust')).toBeUndefined();
  });
});
