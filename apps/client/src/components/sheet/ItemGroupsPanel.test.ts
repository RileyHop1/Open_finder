// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../../api/compendium.js';
import type { ItemGroup } from './featsModel.js';
import ItemGroupsPanel from './ItemGroupsPanel.vue';

vi.mock('../../api/compendium.js');

const groups = [
  {
    heading: 'Class feats',
    items: [
      {
        id: 'i1',
        equipped: false,
        quantity: 1,
        entry: { kind: 'feat', slug: 'power-attack', name: 'Power Attack', level: 2 },
      },
    ],
  },
  {
    heading: 'Class features',
    items: [
      {
        id: 'i2',
        equipped: false,
        quantity: 1,
        entry: { kind: 'classFeature', slug: 'rage', name: 'Rage', level: 1 },
      },
    ],
  },
] as unknown as ItemGroup[];

function mountPanel(editable = false, list: readonly ItemGroup[] = groups) {
  return mount(ItemGroupsPanel, {
    props: {
      title: 'Feats',
      groups: list,
      kinds: ['feat'],
      emptyText: 'Nothing.',
      editable,
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(true);
  vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
    {
      packId: 'feats',
      slug: 'sudden-charge',
      name: 'Sudden Charge',
      kind: 'feat',
      traits: [],
    },
  ]);
});

describe('ItemGroupsPanel', () => {
  it('lists each group with its items and levels, or the empty text', () => {
    const wrapper = mountPanel();
    expect(wrapper.findAll('h4').map((h) => h.text())).toEqual([
      'Class feats',
      'Class features',
    ]);
    expect(wrapper.text()).toContain('Power Attack');
    expect(wrapper.text()).toContain('Level 2');
    expect(mountPanel(false, []).text()).toBe('Nothing.');
  });

  it('offers Remove and the picker to editors only', () => {
    expect(mountPanel(false).find('button[aria-label^="Remove"]').exists()).toBe(false);
    expect(mountPanel(false).find('details').exists()).toBe(false);
    expect(mountPanel(true).find('button[aria-label="Remove Rage"]').exists()).toBe(true);
  });

  it('emits remove with the item id', async () => {
    const wrapper = mountPanel(true);
    await wrapper.get('button[aria-label="Remove Power Attack"]').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([['i1']]);
  });

  it('searches the allowed kinds and emits add for a result', async () => {
    const wrapper = mountPanel(true);
    const details = wrapper.get('details.picker');
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger('toggle');
    await flushPromises();
    expect(compendiumApi.searchCompendium).toHaveBeenCalledWith({ q: '', kind: 'feat' });
    await wrapper.get('button[aria-label="Add Sudden Charge"]').trigger('click');
    expect(wrapper.emitted('add')).toEqual([['feats', 'sudden-charge']]);
  });
});
