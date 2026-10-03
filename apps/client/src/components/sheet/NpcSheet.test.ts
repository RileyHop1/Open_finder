// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ConditionsPanel from './ConditionsPanel.vue';
import HitPointsPanel from './HitPointsPanel.vue';
import NpcSheet from './NpcSheet.vue';
import StrikesPanel from './StrikesPanel.vue';
import { BOG_STRANGLER, makeNpc } from './testNpc.js';

/** The same monster with conditions and hit points, as the server would have stored it. */
function withState(
  conditions: { slug: string; value?: number }[],
  hp = { current: 45, temp: 0 },
): Actor {
  const npc = makeNpc();
  return { ...npc, system: { ...(npc.system as object), conditions, hp } };
}

const row = (wrapper: ReturnType<typeof mount>, label: string) =>
  wrapper.findAll('tbody tr').find((tr) => tr.get('th').text() === label);

describe('NpcSheet', () => {
  it('names the monster, and says what it is', () => {
    const wrapper = mount(NpcSheet, { props: { actor: makeNpc() } });
    expect(wrapper.get('h3').text()).toBe('Invented Bog Strangler');
    expect(wrapper.text()).toContain('Creature 3');
    expect(wrapper.text()).toContain('Large');
    expect(wrapper.text()).toContain('plant, swamp');
    expect(wrapper.text()).toContain('Speed 25 ft, Swim 10 ft');
  });

  it('lists the defences, perception, and skills with their totals', () => {
    const wrapper = mount(NpcSheet, { props: { actor: makeNpc() } });
    expect(row(wrapper, 'Armor Class')?.get('.total').text()).toBe('19');
    expect(row(wrapper, 'Fortitude')?.get('.total').text()).toBe('+10');
    expect(row(wrapper, 'Perception')?.get('.total').text()).toBe('+8');
    expect(row(wrapper, 'Athletics')?.get('.total').text()).toBe('+11');
    expect(row(wrapper, 'Stealth')?.get('.total').text()).toBe('+7');
  });

  it('shows conditions in the totals, since they are what the server rolls with', () => {
    const wrapper = mount(NpcSheet, {
      props: { actor: withState([{ slug: 'frightened', value: 2 }]) },
    });
    expect(row(wrapper, 'Armor Class')?.get('.total').text()).toBe('17');
    expect(row(wrapper, 'Athletics')?.get('.total').text()).toBe('+9');
  });

  it('offers a Roll on every statistic but Armor Class when rollable', () => {
    const wrapper = mount(NpcSheet, { props: { actor: makeNpc(), rollable: true } });
    expect(row(wrapper, 'Armor Class')?.find('button').exists()).toBe(false);
    wrapper.get('button[aria-label="Roll Perception"]');
    wrapper.get('button[aria-label="Roll Athletics"]');
    expect(wrapper.find('button[aria-label="Roll Armor Class"]').exists()).toBe(false);

    const read = mount(NpcSheet, { props: { actor: makeNpc() } });
    expect(read.find('button').exists()).toBe(false);
  });

  it('asks to roll the statistic by its key', async () => {
    const wrapper = mount(NpcSheet, { props: { actor: makeNpc(), rollable: true } });
    await wrapper.get('button[aria-label="Roll Athletics"]').trigger('click');
    await wrapper.get('button[aria-label="Roll Will"]').trigger('click');
    expect(wrapper.emitted('roll')).toEqual([['skill:athletics'], ['will']]);
  });

  it('lets the GM set the current hit points directly, within the maximum', async () => {
    const wrapper = mount(NpcSheet, {
      props: { actor: withState([], { current: 40, temp: 0 }) },
    });
    const field = wrapper.get('input[type="number"]');
    expect(wrapper.text()).toContain('of 45');
    (field.element as HTMLInputElement).value = '30';
    await field.trigger('change');
    (field.element as HTMLInputElement).value = '500';
    await field.trigger('change');
    expect(wrapper.emitted('change')).toEqual([
      [{ 'system.hp.current': 30 }],
      [{ 'system.hp.current': 45 }],
    ]);
  });

  it('says so when the stored stat block cannot be read', () => {
    const wrapper = mount(NpcSheet, {
      props: { actor: { ...makeNpc(), system: {} } },
    });
    expect(wrapper.text()).toContain('could not be read');
  });
});

describe('the shared panels, for a monster', () => {
  it('hit points: reads the monster’s, and damage sends an amount for the server to apply', async () => {
    const wrapper = mount(HitPointsPanel, {
      props: { actor: withState([], { current: 40, temp: 5 }), editable: true },
    });
    expect(wrapper.text()).toContain('40 / 45');
    expect(wrapper.text()).toContain('5 temporary');

    await wrapper.get('#hp-amount').setValue('10');
    await wrapper.get('form').trigger('submit');
    // M5 C.8a: the server runs the dying chain, so only the amount is sent.
    expect(wrapper.emitted('damage')).toEqual([[10, false]]);
  });

  it('conditions: lists the monster’s, with their values', () => {
    const wrapper = mount(ConditionsPanel, {
      props: { actor: withState([{ slug: 'frightened', value: 2 }]) },
    });
    expect(wrapper.text()).toContain('Frightened 2');
  });

  it('strikes: shows the stat block’s, and names them by key, not item id', async () => {
    const wrapper = mount(StrikesPanel, {
      props: { actor: makeNpc(), rollable: true },
    });
    expect(wrapper.text()).toContain('Vine');
    expect(wrapper.text()).toContain('1st +11');
    expect(wrapper.text()).toContain('2nd +6');
    expect(wrapper.text()).toContain('1d8');

    await wrapper.get('button[aria-label^="Roll Vine 2nd attack"]').trigger('click');
    await wrapper.get('button[aria-label="Roll Vine critical damage"]').trigger('click');
    expect(wrapper.emitted('attack')).toEqual([['strike:vine', 2]]);
    expect(wrapper.emitted('damage')).toEqual([['strike:vine', true]]);
  });

  it('strikes: says a monster with none has none', () => {
    const npc = makeNpc();
    const bare = {
      ...npc,
      system: {
        ...(npc.system as { creature: object }),
        creature: { ...BOG_STRANGLER, strikes: [] },
      },
    };
    const wrapper = mount(StrikesPanel, { props: { actor: bare } });
    expect(wrapper.text()).toContain('This monster has no strikes');
  });
});
