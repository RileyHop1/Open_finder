// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import TokenMenu from './TokenMenu.vue';
import type { TokenView } from './tokenModel.js';

const view = (overrides: Partial<TokenView> = {}): TokenView => ({
  id: 'token-1',
  actorId: 'actor-1',
  label: 'Goblin',
  initials: 'G',
  x: 100,
  y: 100,
  size: 1,
  diameter: 100,
  hidden: false,
  portrait: undefined,
  openable: true,
  movable: true,
  selected: true,
  ...overrides,
});

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) {
    wrapper.unmount();
  }
});

function mountMenu(token = view()) {
  const wrapper = mount(TokenMenu, {
    props: { token, x: 10, y: 20 },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

const item = (wrapper: ReturnType<typeof mountMenu>, label: string) =>
  wrapper.findAll('[role="menuitem"]').find((b) => b.text() === label);

describe('the menu', () => {
  it('is a labelled menu with the focus on its first item', async () => {
    const wrapper = mountMenu();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="menu"]').attributes('aria-label')).toBe('Token: Goblin');
    expect(document.activeElement).toBe(wrapper.findAll('[role="menuitem"]')[0]?.element);
  });

  it('offers to hide a shown token and to show a hidden one', () => {
    expect(item(mountMenu(), 'Hide from players')).toBeDefined();
    expect(item(mountMenu(view({ hidden: true })), 'Show to players')).toBeDefined();
  });

  it('asks for hiding and removing', async () => {
    const wrapper = mountMenu();
    await item(wrapper, 'Hide from players')?.trigger('click');
    await item(wrapper, 'Remove from map')?.trigger('click');
    expect(wrapper.emitted('toggleHidden')).toHaveLength(1);
    expect(wrapper.emitted('remove')).toHaveLength(1);
  });

  it('moves between items with the arrow keys, wrapping, and with Home and End', async () => {
    const wrapper = mountMenu();
    await wrapper.vm.$nextTick();
    const items = wrapper.findAll('[role="menuitem"]');
    const menu = wrapper.get('[role="menu"]');
    await menu.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]?.element);
    await menu.trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(items[2]?.element);
    await menu.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]?.element);
    await menu.trigger('keydown', { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[2]?.element);
    await menu.trigger('keydown', { key: 'Home' });
    expect(document.activeElement).toBe(items[0]?.element);
  });

  it('closes on Escape and on Tab', async () => {
    const wrapper = mountMenu();
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' });
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Tab' });
    expect(wrapper.emitted('close')).toHaveLength(2);
  });
});

describe('name and size', () => {
  async function editor(token = view()) {
    const wrapper = mountMenu(token);
    await item(wrapper, 'Name and size')?.trigger('click');
    return wrapper;
  }

  it('starts from the token’s current name and size', async () => {
    const wrapper = await editor(view({ size: 2 }));
    expect((wrapper.get('#token-name').element as HTMLInputElement).value).toBe('Goblin');
    expect((wrapper.get('#token-size').element as HTMLInputElement).value).toBe('2');
  });

  it('sends only what changed, then closes', async () => {
    const wrapper = await editor();
    await wrapper.get('#token-name').setValue('  Sneaky Goblin ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('update')).toEqual([[{ name: 'Sneaky Goblin' }]]);

    const both = await editor();
    await both.get('#token-size').setValue('3');
    await both.get('form').trigger('submit');
    expect(both.emitted('update')).toEqual([[{ size: 3 }]]);
    expect(both.emitted('close')).toHaveLength(1);
  });

  it('goes back to the character’s own name when the name is cleared', async () => {
    const wrapper = await editor();
    await wrapper.get('#token-name').setValue('   ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('update')).toEqual([[{ name: null }]]);
  });

  it('sends nothing when nothing changed, and nothing on Cancel', async () => {
    const wrapper = await editor();
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.emitted('close')).toHaveLength(1);

    const other = await editor();
    await other.get('#token-name').setValue('Changed');
    await other
      .findAll('button')
      .find((b) => b.text() === 'Cancel')
      ?.trigger('click');
    expect(other.emitted('update')).toBeUndefined();
  });
});
