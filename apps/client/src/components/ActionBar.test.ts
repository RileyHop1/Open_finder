// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import ActionBar from './ActionBar.vue';
import type { ActionBarView } from './actionBarModel.js';

// A strike's trait names render through `RulesTerm`, which reaches a Pinia
// store for its tooltip lookup even when nothing opens the tooltip.
beforeEach(() => {
  setActivePinia(createPinia());
});

function view(fields: Partial<ActionBarView> = {}): ActionBarView {
  return {
    strikes: [
      {
        name: 'Sword',
        target: { itemId: 'item-1' },
        attacks: [
          {
            label: '1st',
            attackNumber: 1,
            total: 7,
            statistic: { total: 7, modifiers: [] },
          },
          {
            label: '2nd',
            attackNumber: 2,
            total: 2,
            statistic: { total: 2, modifiers: [] },
          },
          {
            label: '3rd',
            attackNumber: 3,
            total: -3,
            statistic: { total: -3, modifiers: [] },
          },
        ],
        ranged: false,
        reach: false,
        rangeFeet: undefined,
        traits: ['finesse', 'agile'],
      },
    ],
    canAct: true,
    ...fields,
  };
}

describe('ActionBar', () => {
  it('shows each strike’s three MAP variants and emits which was clicked', async () => {
    const wrapper = mount(ActionBar, {
      props: { view: view(), label: 'Ada' },
    });
    expect(wrapper.text()).toContain('1st +7');
    expect(wrapper.text()).toContain('3rd −3');

    await wrapper.find('button[aria-label="Roll Sword 2nd attack, +2"]').trigger('click');
    expect(wrapper.emitted('strike')).toEqual([[{ itemId: 'item-1' }, 2]]);
  });

  it('opens an attack’s own breakdown, separately from rolling it', async () => {
    const wrapper = mount(ActionBar, {
      props: { view: view(), label: 'Ada' },
    });
    await wrapper.get('.stat-trigger').trigger('click');

    const popover = wrapper.get('.stat-popover');
    expect(popover.get('h4').text()).toBe('Sword 1st attack');
    expect(wrapper.emitted('strike')).toBeUndefined();
  });

  it('says so when there are no strikes', () => {
    const wrapper = mount(ActionBar, {
      props: { view: view({ strikes: [] }), label: 'Ada' },
    });
    expect(wrapper.text()).toContain('No strikes');
  });

  it('has no per-action buttons: strikes and the one generic action form only', () => {
    const wrapper = mount(ActionBar, { props: { view: view(), label: 'Ada' } });
    expect(wrapper.find('.basics').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Stride');
    expect(wrapper.find('form.action-form').exists()).toBe(true);
  });

  it('offers the generic action to anyone, and emits its text, cost, dice and modifier', async () => {
    const wrapper = mount(ActionBar, { props: { view: view(), label: 'Ada' } });
    await wrapper.find('#action-text').setValue('  Pries the door open ');
    await wrapper.find('#action-cost').setValue('2');
    await wrapper.find('#action-dice').setValue('1d20+7');
    await wrapper.find('#action-modifier').setValue('-2');
    await wrapper.find('form.action-form').trigger('submit');
    expect(wrapper.emitted('action')).toEqual([
      [{ text: 'Pries the door open', cost: 2, dice: '1d20+7', modifier: -2 }],
    ]);
    expect((wrapper.find('#action-text').element as HTMLInputElement).value).toBe('');
  });

  it('can be free or a reaction, and defaults to a modifier of zero with no dice', async () => {
    const wrapper = mount(ActionBar, { props: { view: view(), label: 'Ada' } });
    await wrapper.find('#action-text').setValue('Shield Block');
    await wrapper.find('#action-cost').setValue('reaction');
    await wrapper.find('form.action-form').trigger('submit');
    await wrapper.find('#action-text').setValue('Talk');
    await wrapper.find('#action-cost').setValue('free');
    await wrapper.find('form.action-form').trigger('submit');
    expect(wrapper.emitted('action')).toEqual([
      [{ text: 'Shield Block', cost: 'reaction', dice: '', modifier: 0 }],
      [{ text: 'Talk', cost: 'free', dice: '', modifier: 0 }],
    ]);
  });

  it('does not submit an empty description', async () => {
    const wrapper = mount(ActionBar, { props: { view: view(), label: 'Ada' } });
    await wrapper.find('#action-text').setValue('   ');
    await wrapper.find('form.action-form').trigger('submit');
    expect(wrapper.emitted('action')).toBeUndefined();
  });

  it('hides the cost picker with no combatant to spend against, but keeps the form', () => {
    const wrapper = mount(ActionBar, {
      props: { view: view({ canAct: false }), label: 'Ada' },
    });
    expect(wrapper.find('#action-cost').exists()).toBe(false);
    expect(wrapper.find('form.action-form').exists()).toBe(true);
  });

  it('shows why an action was not sent', () => {
    const wrapper = mount(ActionBar, {
      props: { view: view(), label: 'Ada', error: 'Those dice don’t work' },
    });
    expect(wrapper.get('[role="alert"]').text()).toContain('dice');
  });

  it('emits hoverStrike on mouseenter or focus, and unhoverStrike on mouseleave or blur', async () => {
    const wrapper = mount(ActionBar, {
      props: { view: view(), label: 'Ada' },
    });
    const attack = wrapper.get('.attack');
    const button = wrapper.get('button[aria-label="Roll Sword 1st attack, +7"]');

    await attack.trigger('mouseenter');
    expect(wrapper.emitted('hoverStrike')).toEqual([[view().strikes[0]]]);
    await attack.trigger('mouseleave');
    expect(wrapper.emitted('unhoverStrike')).toHaveLength(1);

    await button.trigger('focus');
    expect(wrapper.emitted('hoverStrike')).toHaveLength(2);
    await button.trigger('blur');
    expect(wrapper.emitted('unhoverStrike')).toHaveLength(2);
  });
});
