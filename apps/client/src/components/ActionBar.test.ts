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

describe('ActionBar hotbar', () => {
  const saved = (): (null | {
    name: string;
    text: string;
    cost: 1 | 2;
    dice?: string;
  })[] => {
    const bar: (null | { name: string; text: string; cost: 1 | 2; dice?: string })[] =
      Array.from({ length: 10 }, () => null);
    bar[0] = { name: 'Stab', text: 'Sneak attack', cost: 2, dice: '1d6' };
    return bar;
  };
  const mountBar = (hotbar = saved()) =>
    mount(ActionBar, {
      props: { view: view(), label: 'Ada', hotbar },
      attachTo: document.body,
    });
  const value = (wrapper: ReturnType<typeof mountBar>, id: string) =>
    (wrapper.get(id).element as HTMLInputElement).value;

  it('loads a slot into the form through its exposed loadSlot, without spending anything', async () => {
    const wrapper = mountBar();
    wrapper.vm.loadSlot(0);
    await wrapper.vm.$nextTick();
    expect(value(wrapper, '#action-text')).toBe('Sneak attack');
    expect(value(wrapper, '#action-cost')).toBe('2');
    expect(value(wrapper, '#action-dice')).toBe('1d6');
    expect(wrapper.emitted('action')).toBeUndefined();
    wrapper.unmount();
  });

  it('saves the form to the chosen slot through the Save popover', async () => {
    const wrapper = mountBar();
    await wrapper.get('#action-text').setValue('Trip');
    await wrapper.get('#action-cost').setValue('1');
    await wrapper.get('#action-dice').setValue('1d20+5');
    await wrapper.get('.save-toggle').trigger('click');
    await wrapper.get('button[aria-label="Slot 3: empty"]').trigger('click');
    const next = wrapper.emitted('setHotbar')?.[0]?.[0] as unknown[];
    expect(next[2]).toEqual({ name: 'Trip', text: 'Trip', cost: 1, dice: '1d20+5' });
    expect(next[0]).toEqual(saved()[0]);
    wrapper.unmount();
  });

  it('saves straight to a slot through saveCurrentTo, named from the action, and says whether the form has anything', async () => {
    const wrapper = mountBar();
    expect(wrapper.vm.hasContent).toBe(false);
    await wrapper.get('#action-text').setValue('Trip');
    expect(wrapper.vm.hasContent).toBe(true);
    wrapper.vm.saveCurrentTo(2);
    const next = wrapper.emitted('setHotbar')?.[0]?.[0] as unknown[];
    expect(next[2]).toEqual({ name: 'Trip', text: 'Trip', cost: 1 });
    wrapper.unmount();
  });

  it('no longer renders the hotbar itself: it is its own bar', () => {
    const wrapper = mountBar();
    expect(wrapper.find('.hotbar').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('ActionBar', () => {
  const mods = [
    { value: 2, label: 'Flanking', active: true },
    { value: 1, active: true },
    { value: -4, label: 'Prone', active: false },
  ];

  it('adds the switched-on modifiers to each strike’s shown bonus, so what you see is what is rolled', () => {
    const wrapper = mount(ActionBar, {
      props: { view: view(), label: 'Ada', modifiers: mods },
    });
    expect(wrapper.text()).toContain('1st +10');
    expect(wrapper.find('button[aria-label="Roll Sword 1st attack, +10"]').exists()).toBe(
      true,
    );
    expect(wrapper.get('.mods-total').text()).toBe('Mods +3');
  });

  it('passes the modifier list’s changes up as setModifiers', async () => {
    const wrapper = mount(ActionBar, {
      props: { view: view(), label: 'Ada', modifiers: mods },
    });
    await wrapper.get('.mods-toggle').trigger('click');
    await wrapper.findAll('.mods input[type="checkbox"]')[2]?.setValue(true);
    expect(wrapper.emitted('setModifiers')?.[0]?.[0]).toEqual([
      mods[0],
      mods[1],
      { value: -4, label: 'Prone', active: true },
    ]);
  });

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

  it('offers the generic action to anyone, and emits its text, cost and dice', async () => {
    const wrapper = mount(ActionBar, { props: { view: view(), label: 'Ada' } });
    await wrapper.find('#action-text').setValue('  Pries the door open ');
    await wrapper.find('#action-cost').setValue('2');
    await wrapper.find('#action-dice').setValue('1d20+7');
    await wrapper.find('form.action-form').trigger('submit');
    expect(wrapper.emitted('action')).toEqual([
      [{ text: 'Pries the door open', cost: 2, dice: '1d20+7' }],
    ]);
    expect((wrapper.find('#action-text').element as HTMLInputElement).value).toBe('');
  });

  it('can be free or a reaction, and has no dice by default', async () => {
    const wrapper = mount(ActionBar, { props: { view: view(), label: 'Ada' } });
    await wrapper.find('#action-text').setValue('Shield Block');
    await wrapper.find('#action-cost').setValue('reaction');
    await wrapper.find('form.action-form').trigger('submit');
    await wrapper.find('#action-text').setValue('Talk');
    await wrapper.find('#action-cost').setValue('free');
    await wrapper.find('form.action-form').trigger('submit');
    expect(wrapper.emitted('action')).toEqual([
      [{ text: 'Shield Block', cost: 'reaction', dice: '' }],
      [{ text: 'Talk', cost: 'free', dice: '' }],
    ]);
  });

  it('will not Spend with nothing entered: the button is off and a submit does nothing', async () => {
    const wrapper = mount(ActionBar, { props: { view: view(), label: 'Ada' } });
    const spend = wrapper.get('button[type="submit"]');
    expect(spend.text()).toBe('Spend');
    expect(spend.attributes('disabled')).toBeDefined();
    await wrapper.find('#action-text').setValue('   ');
    await wrapper.find('form.action-form').trigger('submit');
    expect(wrapper.emitted('action')).toBeUndefined();
  });

  it('spends with dice alone, or with a description alone', async () => {
    const wrapper = mount(ActionBar, { props: { view: view(), label: 'Ada' } });
    await wrapper.find('#action-dice').setValue('1d20+3');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('form.action-form').trigger('submit');
    await wrapper.find('#action-text').setValue('Stride');
    await wrapper.find('form.action-form').trigger('submit');
    expect(wrapper.emitted('action')).toEqual([
      [{ text: '', cost: 1, dice: '1d20+3' }],
      [{ text: 'Stride', cost: 1, dice: '' }],
    ]);
  });

  it('puts the modifiers in a row of their own, outside the action row', () => {
    const wrapper = mount(ActionBar, { props: { view: view(), label: 'Ada' } });
    expect(wrapper.find('.bar-row .mods').exists()).toBe(false);
    expect(wrapper.find('.action-bar > .mods').exists()).toBe(true);
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
