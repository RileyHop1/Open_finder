// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import TurnControls from './TurnControls.vue';

describe('TurnControls', () => {
  it('offers the full set to the GM: Previous turn, Next turn, End combat, Free movement', () => {
    const wrapper = mount(TurnControls, {
      props: { isGm: true, canEndTurn: true, freeMovement: false },
    });
    const labels = wrapper.findAll('button').map((b) => b.text());
    expect(labels).toEqual(['Previous turn', 'Next turn', 'End combat']);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true);
  });

  it('offers only End turn to a player who owns the active combatant', () => {
    const wrapper = mount(TurnControls, {
      props: { isGm: false, canEndTurn: true, freeMovement: false },
    });
    const labels = wrapper.findAll('button').map((b) => b.text());
    expect(labels).toEqual(['End turn']);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
  });

  it('offers nothing to a player who does not own the active combatant', () => {
    const wrapper = mount(TurnControls, {
      props: { isGm: false, canEndTurn: false, freeMovement: false },
    });
    expect(wrapper.findAll('button')).toHaveLength(0);
  });

  it('emits previous, next (as the GM) and end', async () => {
    const wrapper = mount(TurnControls, {
      props: { isGm: true, canEndTurn: true, freeMovement: false },
    });
    const [previous, next, end] = wrapper.findAll('button');
    await previous?.trigger('click');
    await next?.trigger('click');
    await end?.trigger('click');
    expect(wrapper.emitted('previous')).toHaveLength(1);
    expect(wrapper.emitted('next')).toHaveLength(1);
    expect(wrapper.emitted('end')).toHaveLength(1);
  });

  it('emits next when a player ends their own turn', async () => {
    const wrapper = mount(TurnControls, {
      props: { isGm: false, canEndTurn: true, freeMovement: false },
    });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('next')).toHaveLength(1);
  });

  it('shows the free-movement checkbox reflecting the prop, and emits on change', async () => {
    const wrapper = mount(TurnControls, {
      props: { isGm: true, canEndTurn: true, freeMovement: true },
    });
    const checkbox = wrapper.get('input[type="checkbox"]');
    expect((checkbox.element as HTMLInputElement).checked).toBe(true);
    await checkbox.setValue(false);
    expect(wrapper.emitted('setFreeMovement')).toEqual([[false]]);
  });
});
