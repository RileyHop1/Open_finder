// @vitest-environment jsdom
import type { Statistic } from '@hearthtable/core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import StatBreakdown from './StatBreakdown.vue';

const STATISTIC: Statistic = {
  total: 19,
  modifiers: [
    {
      slug: 'dex',
      label: 'Dexterity',
      type: 'ability',
      value: 2,
      source: 'attribute',
      enabled: true,
      applied: true,
    },
  ],
};

function render() {
  return mount(StatBreakdown, {
    props: { label: 'Armor Class', statistic: STATISTIC },
    slots: { default: '19' },
  });
}

describe('StatBreakdown', () => {
  it('shows the trigger content, closed, with no popover', () => {
    const wrapper = render();
    expect(wrapper.find('.stat-trigger').text()).toBe('19');
    expect(wrapper.find('.stat-popover').exists()).toBe(false);
  });

  it('opens on click and renders the modifier list', async () => {
    const wrapper = render();
    await wrapper.find('.stat-trigger').trigger('click');

    expect(wrapper.find('.stat-popover').exists()).toBe(true);
    expect(wrapper.find('.stat-popover h4').text()).toBe('Armor Class');
    expect(wrapper.find('.stat-popover').text()).toContain('+2 Dexterity');
  });

  it('toggles closed on a second click', async () => {
    const wrapper = render();
    const trigger = wrapper.find('.stat-trigger');
    await trigger.trigger('click');
    expect(wrapper.find('.stat-popover').exists()).toBe(true);

    await trigger.trigger('click');
    expect(wrapper.find('.stat-popover').exists()).toBe(false);
  });

  it('closes on Escape from anywhere inside it', async () => {
    const wrapper = render();
    await wrapper.find('.stat-trigger').trigger('click');
    await wrapper.find('.stat-popover').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.stat-popover').exists()).toBe(false);
  });

  it("closes via the popover's own close button", async () => {
    const wrapper = render();
    await wrapper.find('.stat-trigger').trigger('click');
    await wrapper.find('.stat-popover-close').trigger('click');
    expect(wrapper.find('.stat-popover').exists()).toBe(false);
  });

  it('closes when focus leaves both the trigger and the popover', async () => {
    const wrapper = render();
    await wrapper.find('.stat-trigger').trigger('click');

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    wrapper
      .find('.stat-trigger')
      .element.dispatchEvent(
        new FocusEvent('focusout', { relatedTarget: outside, bubbles: true }),
      );
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.stat-popover').exists()).toBe(false);
    outside.remove();
  });

  it('does not close when focus moves from the trigger to the close button inside the popover', async () => {
    const wrapper = render();
    await wrapper.find('.stat-trigger').trigger('click');

    const closeButton = wrapper.find('.stat-popover-close').element;
    wrapper
      .find('.stat-trigger')
      .element.dispatchEvent(
        new FocusEvent('focusout', { relatedTarget: closeButton, bubbles: true }),
      );
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.stat-popover').exists()).toBe(true);
  });
});
