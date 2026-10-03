// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ActionTray from './ActionTray.vue';
import type { ActionTrayView } from './actionTrayModel.js';

function view(fields: Partial<ActionTrayView> = {}): ActionTrayView {
  return {
    capacity: { total: 3, quickenedExtra: false },
    spent: 0,
    reactionUsed: false,
    overspent: 0,
    ...fields,
  };
}

describe('ActionTray', () => {
  it('shows actions spent of capacity and the reaction, in words', () => {
    const wrapper = mount(ActionTray, {
      props: { view: view({ spent: 1 }), label: 'Ada', canControl: false },
    });
    expect(wrapper.text()).toContain('1 of 3 actions spent');
    expect(wrapper.text()).toContain('Reaction available');
    expect(wrapper.findAll('.diamond.used')).toHaveLength(1);
  });

  it('says the reaction is used', () => {
    const wrapper = mount(ActionTray, {
      props: { view: view({ reactionUsed: true }), label: 'Ada', canControl: false },
    });
    expect(wrapper.text()).toContain('Reaction used');
  });

  it('names the restricted quickened action without counting it toward the warning', () => {
    const wrapper = mount(ActionTray, {
      props: {
        view: view({ capacity: { total: 4, quickenedExtra: true }, spent: 4 }),
        label: 'Ada',
        canControl: false,
      },
    });
    expect(wrapper.text()).toContain('plus a restricted one');
    expect(wrapper.find('.warning').exists()).toBe(false);
  });

  it('warns in text and an icon on overspend, never only by colour', () => {
    const wrapper = mount(ActionTray, {
      props: {
        view: view({ spent: 5, overspent: 2 }),
        label: 'Ada',
        canControl: false,
      },
    });
    const warning = wrapper.find('.warning');
    expect(warning.text()).toContain('⚠');
    expect(warning.text()).toContain('2 actions over');
  });

  it('hides the control buttons without canControl', () => {
    const wrapper = mount(ActionTray, {
      props: { view: view(), label: 'Ada', canControl: false },
    });
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('spends and gives back an action, and toggles the reaction, for an owner or the GM', async () => {
    const wrapper = mount(ActionTray, {
      props: { view: view({ spent: 1 }), label: 'Ada', canControl: true },
    });
    const buttons = wrapper.findAll('button');
    await buttons[0]?.trigger('click');
    expect(wrapper.emitted('spend')).toEqual([[1]]);
    await buttons[1]?.trigger('click');
    expect(wrapper.emitted('spend')).toEqual([[1], [-1]]);
    await buttons[2]?.trigger('click');
    expect(wrapper.emitted('setReaction')).toEqual([[true]]);
  });

  it('disables undo at zero spent and the reaction buttons once already in that state', () => {
    const wrapper = mount(ActionTray, {
      props: {
        view: view({ spent: 0, reactionUsed: false }),
        label: 'Ada',
        canControl: true,
      },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons[1]?.attributes('disabled')).toBeDefined();
    expect(buttons[3]?.attributes('disabled')).toBeDefined();
  });
});
