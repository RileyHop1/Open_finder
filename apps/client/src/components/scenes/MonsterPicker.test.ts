// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendium from '../../api/compendium.js';
import MonsterPicker from './MonsterPicker.vue';

vi.mock('../../api/compendium.js');

const goblin = {
  packId: 'creatures',
  slug: 'goblin-warrior',
  name: 'Goblin Warrior',
  kind: 'creature',
  traits: ['goblin', 'humanoid', 'small', 'extra'],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(compendium.isCompendiumAvailable).mockResolvedValue(true);
  vi.mocked(compendium.searchCompendium).mockResolvedValue([goblin]);
});

async function openPicker(canPlace = true) {
  const wrapper = mount(MonsterPicker, { props: { canPlace } });
  const details = wrapper.get('details').element as HTMLDetailsElement;
  details.open = true;
  await wrapper.get('details').trigger('toggle');
  await flushPromises();
  return wrapper;
}

describe('MonsterPicker', () => {
  it('looks nothing up until it is opened, then lists creatures', async () => {
    const wrapper = mount(MonsterPicker, { props: { canPlace: true } });
    expect(compendium.searchCompendium).not.toHaveBeenCalled();

    const opened = await openPicker();
    expect(compendium.searchCompendium).toHaveBeenCalledWith({
      q: '',
      kind: 'creature',
      limit: 12,
    });
    expect(opened.text()).toContain('Goblin Warrior');
    // Four traits at most, so a long list never crowds the row.
    expect(opened.text()).toContain('goblin, humanoid, small, extra');
    wrapper.unmount();
  });

  it('searches by the name typed', async () => {
    const wrapper = await openPicker();
    await wrapper.get('#monster-q').setValue('  gob ');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(compendium.searchCompendium).toHaveBeenLastCalledWith({
      q: 'gob',
      kind: 'creature',
      limit: 12,
    });
  });

  it('asks to add the monster it names', async () => {
    const wrapper = await openPicker();
    await wrapper
      .get('button[aria-label="Add Goblin Warrior to the map"]')
      .trigger('click');
    expect(wrapper.emitted('add')).toEqual([['creatures', 'goblin-warrior']]);
  });

  it('turns the buttons off, and says why, when there is no scene', async () => {
    const wrapper = await openPicker(false);
    expect(
      wrapper
        .get('button[aria-label="Add Goblin Warrior to the map"]')
        .attributes('disabled'),
    ).toBeDefined();
    expect(wrapper.text()).toContain('Make a scene');
  });

  it('says so in words when nothing has been imported', async () => {
    vi.mocked(compendium.isCompendiumAvailable).mockResolvedValue(false);
    const wrapper = await openPicker();
    expect(wrapper.text()).toContain('No game content has been imported yet');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(compendium.searchCompendium).not.toHaveBeenCalled();
  });

  it('says when nothing matches, and shows a failed search', async () => {
    vi.mocked(compendium.searchCompendium).mockResolvedValue([]);
    const wrapper = await openPicker();
    expect(wrapper.text()).toContain('No monster matches that');

    vi.mocked(compendium.searchCompendium).mockRejectedValue(new Error('server down'));
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('server down');
  });
});
