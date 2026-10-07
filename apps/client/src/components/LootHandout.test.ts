// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../api/compendium.js';
import LootHandout from './LootHandout.vue';

vi.mock('../api/compendium.js');

const recipients = [
  { id: 'ada', name: 'Ada' },
  { id: 'party', name: 'Party stash' },
];

const rope = { packId: 'equipment', slug: 'rope', name: 'Rope', kind: 'gear' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(true);
  vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([rope] as never);
});

async function mountLoot(
  giveItem = vi.fn().mockResolvedValue(true),
  giveCoins = vi.fn().mockResolvedValue(true),
) {
  const wrapper = mount(LootHandout, { props: { recipients, giveItem, giveCoins } });
  await flushPromises();
  return { wrapper, giveItem, giveCoins };
}

describe('LootHandout', () => {
  it('lists compendium items on open, with the stash as a recipient', async () => {
    const { wrapper } = await mountLoot();
    expect(wrapper.findAll('.to option').map((o) => o.text())).toEqual([
      'Ada',
      'Party stash',
    ]);
    expect(wrapper.text()).toContain('Rope');
  });

  it('gives an item to the chosen recipient with the chosen stack size, and says so', async () => {
    const { wrapper, giveItem } = await mountLoot();
    await wrapper.get('select[aria-label="Give loot to"]').setValue('party');
    await wrapper.get('input[aria-label="How many to hand out"]').setValue('5');
    await wrapper.get('button[aria-label="Give Rope"]').trigger('click');
    await flushPromises();
    expect(giveItem).toHaveBeenCalledWith('party', 'equipment', 'rope', 5);
    expect(wrapper.get('[role="status"].status').text()).toBe(
      'Gave 5 × Rope to Party stash.',
    );
  });

  it('says nothing when the server refused it', async () => {
    const { wrapper } = await mountLoot(vi.fn().mockResolvedValue(false));
    await wrapper.get('button[aria-label="Give Rope"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('.status').exists()).toBe(false);
  });

  it('gives coins in any denominations, clears the form, and ignores an empty one', async () => {
    const { wrapper, giveCoins } = await mountLoot();
    await wrapper.get('form[aria-label="Hand out coins"]').trigger('submit');
    expect(giveCoins).not.toHaveBeenCalled();

    await wrapper.get('input[aria-label="gp to hand out"]').setValue('3');
    await wrapper.get('input[aria-label="sp to hand out"]').setValue('5');
    await wrapper.get('form[aria-label="Hand out coins"]').trigger('submit');
    await flushPromises();
    expect(giveCoins).toHaveBeenCalledWith('ada', { gp: 3, sp: 5 });
    expect(wrapper.get('.status').text()).toBe('Gave 3 gp, 5 sp to Ada.');
    expect(
      (wrapper.get('input[aria-label="gp to hand out"]').element as HTMLInputElement)
        .value,
    ).toBe('');
  });

  it('says so when no content has been imported', async () => {
    vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(false);
    const { wrapper } = await mountLoot();
    expect(wrapper.text()).toContain('No game content has been imported');
    expect(wrapper.find('form[role="search"]').exists()).toBe(false);
  });
});
