// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ActionBar from './ActionBar.vue';
import type { ActionBarView } from './actionBarModel.js';

function view(fields: Partial<ActionBarView> = {}): ActionBarView {
  return {
    strikes: [
      {
        name: 'Sword',
        target: { itemId: 'item-1' },
        attacks: [
          { label: '1st', attackNumber: 1, total: 7 },
          { label: '2nd', attackNumber: 2, total: 2 },
          { label: '3rd', attackNumber: 3, total: -3 },
        ],
        ranged: false,
        reach: false,
        rangeFeet: undefined,
      },
    ],
    basics: [{ slug: 'stride', name: 'Stride', cost: 1 }],
    canAct: true,
    ...fields,
  };
}

describe('ActionBar', () => {
  it('shows each strike’s three MAP variants and emits which was clicked', async () => {
    const wrapper = mount(ActionBar, {
      props: { view: view(), label: 'Ada', gm: false },
    });
    expect(wrapper.text()).toContain('1st +7');
    expect(wrapper.text()).toContain('3rd -3');

    await wrapper.find('button[aria-label="Sword 2nd attack, +2"]').trigger('click');
    expect(wrapper.emitted('strike')).toEqual([[{ itemId: 'item-1' }, 2]]);
  });

  it('says so when there are no strikes', () => {
    const wrapper = mount(ActionBar, {
      props: { view: view({ strikes: [] }), label: 'Ada', gm: false },
    });
    expect(wrapper.text()).toContain('No strikes');
  });

  it('lists basic actions with their cost, and emits the slug and cost on click', async () => {
    const wrapper = mount(ActionBar, {
      props: { view: view(), label: 'Ada', gm: false },
    });
    const basic = wrapper.findAll('.basics button')[0];
    expect(basic?.text()).toContain('Stride');
    expect(basic?.text()).toContain('◆');
    await basic?.trigger('click');
    expect(wrapper.emitted('basicAction')).toEqual([['stride', 1]]);
  });

  it('hides the basic actions with no combatant to spend against', () => {
    const wrapper = mount(ActionBar, {
      props: { view: view({ canAct: false }), label: 'Ada', gm: false },
    });
    expect(wrapper.find('.basics').exists()).toBe(false);
  });

  it('shows "Other action" only for the GM, and emits its label and cost', async () => {
    const player = mount(ActionBar, {
      props: { view: view(), label: 'Ada', gm: false },
    });
    expect(player.find('.freeform').exists()).toBe(false);

    const gm = mount(ActionBar, {
      props: { view: view(), label: 'Ada', gm: true },
    });
    await gm.find('#freeform-label').setValue('Pries the door open');
    await gm.find('#freeform-cost').setValue(2);
    await gm.find('.freeform').trigger('submit');
    expect(gm.emitted('freeform')).toEqual([['Pries the door open', 2]]);
  });

  it('hides "Other action" with no combatant to spend against, even for the GM', () => {
    const wrapper = mount(ActionBar, {
      props: { view: view({ canAct: false }), label: 'Ada', gm: true },
    });
    expect(wrapper.find('.freeform').exists()).toBe(false);
  });

  it('emits hoverStrike on mouseenter or focus, and unhoverStrike on mouseleave or blur', async () => {
    const wrapper = mount(ActionBar, {
      props: { view: view(), label: 'Ada', gm: false },
    });
    const button = wrapper.find('button[aria-label="Sword 1st attack, +7"]');

    await button.trigger('mouseenter');
    expect(wrapper.emitted('hoverStrike')).toEqual([[view().strikes[0]]]);
    await button.trigger('mouseleave');
    expect(wrapper.emitted('unhoverStrike')).toHaveLength(1);

    await button.trigger('focus');
    expect(wrapper.emitted('hoverStrike')).toHaveLength(2);
    await button.trigger('blur');
    expect(wrapper.emitted('unhoverStrike')).toHaveLength(2);
  });
});
