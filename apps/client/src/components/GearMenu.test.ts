// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import GearMenu from './GearMenu.vue';

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) {
    wrapper.unmount();
  }
});

function mountMenu(isGm = false) {
  const wrapper = mount(GearMenu, {
    props: { isGm },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

const item = (wrapper: ReturnType<typeof mountMenu>, label: string) =>
  wrapper.findAll('[role="menuitem"]').find((b) => b.text() === label);

async function openMenu(wrapper: ReturnType<typeof mountMenu>) {
  await wrapper.get('.gear-button').trigger('click');
}

describe('the gear button', () => {
  it('is closed with no menu until clicked, aria-expanded reflects state', async () => {
    const wrapper = mountMenu();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    expect(wrapper.get('.gear-button').attributes('aria-expanded')).toBe('false');

    await openMenu(wrapper);
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    expect(wrapper.get('.gear-button').attributes('aria-expanded')).toBe('true');
  });

  it('closes again on a second click', async () => {
    const wrapper = mountMenu();
    await openMenu(wrapper);
    await openMenu(wrapper);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });
});

describe('the menu', () => {
  it('focuses the first item on open', async () => {
    const wrapper = mountMenu();
    await openMenu(wrapper);
    expect(document.activeElement).toBe(wrapper.findAll('[role="menuitem"]')[0]?.element);
  });

  it('always offers Characters, Rules, Seats, and Release seat', async () => {
    const wrapper = mountMenu();
    await openMenu(wrapper);
    expect(item(wrapper, 'Characters')).toBeDefined();
    expect(item(wrapper, 'Rules')).toBeDefined();
    expect(item(wrapper, 'Seats')).toBeDefined();
    expect(item(wrapper, 'Release seat')).toBeDefined();
  });

  it('offers Scenes, Manage party, and Back to campaigns only for the GM', async () => {
    const player = mountMenu(false);
    await openMenu(player);
    expect(item(player, 'Scenes')).toBeUndefined();
    expect(item(player, 'Manage party')).toBeUndefined();
    expect(item(player, 'Back to campaigns')).toBeUndefined();

    const gm = mountMenu(true);
    await openMenu(gm);
    expect(item(gm, 'Scenes')).toBeDefined();
    expect(item(gm, 'Manage party')).toBeDefined();
    expect(item(gm, 'Back to campaigns')).toBeDefined();
  });

  it('emits and closes when an item is clicked', async () => {
    const wrapper = mountMenu(true);
    await openMenu(wrapper);
    await item(wrapper, 'Scenes')?.trigger('click');

    expect(wrapper.emitted('scenes')).toHaveLength(1);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
  });

  it('emits for Seats, Manage party, and Back to campaigns', async () => {
    const wrapper = mountMenu(true);
    await openMenu(wrapper);
    await item(wrapper, 'Seats')?.trigger('click');
    expect(wrapper.emitted('seats')).toHaveLength(1);

    await openMenu(wrapper);
    await item(wrapper, 'Manage party')?.trigger('click');
    expect(wrapper.emitted('manageParty')).toHaveLength(1);

    await openMenu(wrapper);
    await item(wrapper, 'Back to campaigns')?.trigger('click');
    expect(wrapper.emitted('leaveCampaign')).toHaveLength(1);
  });

  it('moves between items with the arrow keys, wrapping, and with Home and End', async () => {
    const wrapper = mountMenu();
    await openMenu(wrapper);
    const items = wrapper.findAll('[role="menuitem"]');
    const menu = wrapper.get('[role="menu"]');

    await menu.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]?.element);
    await menu.trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(items[3]?.element);
    await menu.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]?.element);
    await menu.trigger('keydown', { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[3]?.element);
    await menu.trigger('keydown', { key: 'Home' });
    expect(document.activeElement).toBe(items[0]?.element);
  });

  it('closes on Escape and returns focus to the gear button', async () => {
    const wrapper = mountMenu();
    await openMenu(wrapper);
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' });

    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('.gear-button').element);
  });

  it('closes when focus leaves the button and the menu both', async () => {
    const wrapper = mountMenu();
    await openMenu(wrapper);

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    wrapper
      .get('.gear-button')
      .element.dispatchEvent(
        new FocusEvent('focusout', { relatedTarget: outside, bubbles: true }),
      );
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    outside.remove();
  });

  it('does not close when focus moves from the button to an item inside the menu', async () => {
    const wrapper = mountMenu();
    await openMenu(wrapper);

    const firstItem = wrapper.get('[role="menuitem"]').element;
    wrapper
      .get('.gear-button')
      .element.dispatchEvent(
        new FocusEvent('focusout', { relatedTarget: firstItem, bubbles: true }),
      );
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
  });
});
