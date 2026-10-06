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
  const mountTray = (fields: Partial<ActionTrayView> = {}, canControl = false) =>
    mount(ActionTray, { props: { view: view(fields), label: 'Ada', canControl } });

  it('shows actions spent of capacity and the reaction, briefly, in words', () => {
    const wrapper = mountTray({ spent: 1 });
    expect(wrapper.text()).toContain('1/3 actions');
    expect(wrapper.text()).toContain('reaction ready');
    expect(wrapper.findAll('.diamond.used')).toHaveLength(1);
  });

  it('says the reaction is used', () => {
    expect(mountTray({ reactionUsed: true }).text()).toContain('reaction used');
  });

  it('names the restricted quickened action without counting it toward the warning', () => {
    const wrapper = mountTray({
      capacity: { total: 4, quickenedExtra: true },
      spent: 4,
    });
    expect(wrapper.text()).toContain('+1 restricted');
    expect(wrapper.find('.warning').exists()).toBe(false);
  });

  it('warns in text and an icon on overspend, never only by colour', () => {
    const warning = mountTray({ spent: 5, overspent: 2 }).find('.warning');
    expect(warning.text()).toContain('⚠');
    expect(warning.text()).toContain('+2 over');
  });

  it('hides its buttons without canControl', () => {
    expect(mountTray().find('button').exists()).toBe(false);
  });

  it('has only Reaction and Undo, for an owner or the GM', async () => {
    const wrapper = mountTray({ spent: 1 }, true);
    const buttons = wrapper.findAll('button');
    expect(buttons.map((b) => b.text())).toEqual(['Reaction', 'Undo']);
    await buttons[0]?.trigger('click');
    expect(wrapper.emitted('setReaction')).toEqual([[true]]);
    await buttons[1]?.trigger('click');
    expect(wrapper.emitted('undo')).toEqual([[]]);
  });

  it('disables Reaction once it is used, and never disables Undo', () => {
    const used = mountTray({ reactionUsed: true }, true).findAll('button');
    expect(used[0]?.attributes('disabled')).toBeDefined();
    expect(used[1]?.attributes('disabled')).toBeUndefined();
  });
});
