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
      props: { view: view({ spent: 1 }), label: 'Ada', canControl: false, gm: false },
    });
    expect(wrapper.text()).toContain('1 of 3 actions spent');
    expect(wrapper.text()).toContain('Reaction available');
    expect(wrapper.findAll('.diamond.used')).toHaveLength(1);
  });

  it('says the reaction is used', () => {
    const wrapper = mount(ActionTray, {
      props: {
        view: view({ reactionUsed: true }),
        label: 'Ada',
        canControl: false,
        gm: false,
      },
    });
    expect(wrapper.text()).toContain('Reaction used');
  });

  it('names the restricted quickened action without counting it toward the warning', () => {
    const wrapper = mount(ActionTray, {
      props: {
        view: view({ capacity: { total: 4, quickenedExtra: true }, spent: 4 }),
        label: 'Ada',
        canControl: false,
        gm: false,
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
        gm: false,
      },
    });
    const warning = wrapper.find('.warning');
    expect(warning.text()).toContain('⚠');
    expect(warning.text()).toContain('2 actions over');
  });

  it('hides the control buttons without canControl, GM or not', () => {
    const wrapper = mount(ActionTray, {
      props: { view: view(), label: 'Ada', canControl: false, gm: true },
    });
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('spends an action, toggles the reaction, and undoes the last step, for an owner', async () => {
    const wrapper = mount(ActionTray, {
      props: { view: view({ spent: 1 }), label: 'Ada', canControl: true, gm: false },
    });
    // No GM, so no "Give back an action": Spend, Spend reaction, Give back reaction, Undo.
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(4);
    await buttons[0]?.trigger('click');
    expect(wrapper.emitted('spend')).toEqual([[1]]);
    await buttons[1]?.trigger('click');
    expect(wrapper.emitted('setReaction')).toEqual([[true]]);
    await buttons[3]?.trigger('click');
    expect(wrapper.emitted('undo')).toEqual([[]]);
  });

  it('gives the GM alone "Give back an action", a flat manual override', async () => {
    const wrapper = mount(ActionTray, {
      props: { view: view({ spent: 1 }), label: 'Ada', canControl: true, gm: true },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(5);
    expect(buttons[1]?.text()).toBe('Give back an action');
    await buttons[1]?.trigger('click');
    expect(wrapper.emitted('spend')).toEqual([[-1]]);
  });

  it('disables give-back at zero spent and the reaction buttons once already in that state', () => {
    const wrapper = mount(ActionTray, {
      props: {
        view: view({ spent: 0, reactionUsed: false }),
        label: 'Ada',
        canControl: true,
        gm: true,
      },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons[1]?.attributes('disabled')).toBeDefined();
    expect(buttons[3]?.attributes('disabled')).toBeDefined();
  });

  it('always shows "Undo last action" when it may control the tray, with no state check', () => {
    const wrapper = mount(ActionTray, {
      props: { view: view(), label: 'Ada', canControl: true, gm: false },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons.at(-1)?.text()).toBe('Undo last action');
    expect(buttons.at(-1)?.attributes('disabled')).toBeUndefined();
  });
});
