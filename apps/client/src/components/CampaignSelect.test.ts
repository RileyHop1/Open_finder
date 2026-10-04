// @vitest-environment jsdom
import type { World } from '@hearthtable/core';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as worldsApi from '../api/worlds.js';
import CampaignSelect from './CampaignSelect.vue';

vi.mock('../api/worlds.js');

function makeWorld(overrides: Partial<World> = {}): World {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: 'Test Campaign',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function mountCampaignSelect() {
  return mount(CampaignSelect, {
    global: { plugins: [createPinia()] },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(worldsApi.listWorlds).mockResolvedValue([]);
  vi.mocked(worldsApi.getActiveWorld).mockResolvedValue(undefined);
});

describe('CampaignSelect', () => {
  it('loads and lists every campaign on mount', async () => {
    const a = makeWorld({ name: 'Curse of the Crimson Throne' });
    const b = makeWorld({ name: 'Rise of the Runelords' });
    vi.mocked(worldsApi.listWorlds).mockResolvedValue([a, b]);

    const wrapper = mountCampaignSelect();
    await flushPromises();

    expect(wrapper.text()).toContain('Curse of the Crimson Throne');
    expect(wrapper.text()).toContain('Rise of the Runelords');
  });

  it('shows "Active" next to the active campaign, not an Activate button', async () => {
    const active = makeWorld({ name: 'Active Campaign' });
    const other = makeWorld({ name: 'Other Campaign' });
    vi.mocked(worldsApi.listWorlds).mockResolvedValue([active, other]);
    vi.mocked(worldsApi.getActiveWorld).mockResolvedValue(active);

    const wrapper = mountCampaignSelect();
    await flushPromises();

    const rows = wrapper.findAll('.campaign-row');
    const activeRow = rows.find((row) => row.text().includes('Active Campaign'));
    const otherRow = rows.find((row) => row.text().includes('Other Campaign'));

    expect(activeRow?.find('.active-badge').exists()).toBe(true);
    expect(activeRow?.find('button').exists()).toBe(false);
    expect(otherRow?.find('button').exists()).toBe(true);
  });

  it('shows a message when there are no campaigns yet', async () => {
    const wrapper = mountCampaignSelect();
    await flushPromises();
    expect(wrapper.text()).toContain('No campaigns yet');
  });

  it('creates a campaign from the form and clears the input', async () => {
    const created = makeWorld({ name: 'Brand New Campaign' });
    vi.mocked(worldsApi.createWorld).mockResolvedValue(created);

    const wrapper = mountCampaignSelect();
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>('#new-campaign-name');
    await input.setValue('Brand New Campaign');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(worldsApi.createWorld).toHaveBeenCalledWith('Brand New Campaign');
    expect(wrapper.text()).toContain('Brand New Campaign');
    expect(input.element.value).toBe('');
  });

  it('does not call create for a blank name', async () => {
    const wrapper = mountCampaignSelect();
    await flushPromises();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(worldsApi.createWorld).not.toHaveBeenCalled();
  });

  it('activates a campaign when its button is clicked', async () => {
    const world = makeWorld();
    vi.mocked(worldsApi.listWorlds).mockResolvedValue([world]);
    vi.mocked(worldsApi.activateWorld).mockResolvedValue(world);

    const wrapper = mountCampaignSelect();
    await flushPromises();

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(worldsApi.activateWorld).toHaveBeenCalledWith(world.id);
  });

  it('shows a server error as an alert', async () => {
    vi.mocked(worldsApi.listWorlds).mockRejectedValue(new Error('server unreachable'));

    const wrapper = mountCampaignSelect();
    await flushPromises();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('server unreachable');
  });

  it('has a label associated with the campaign name input, for keyboard/screen-reader users', async () => {
    const wrapper = mountCampaignSelect();
    await flushPromises();

    const label = wrapper.find('label[for="new-campaign-name"]');
    expect(label.exists()).toBe(true);
    expect(wrapper.find('#new-campaign-name').exists()).toBe(true);
  });

  describe('deleting a campaign', () => {
    it('asks before deleting, and only calls deleteWorld after confirming', async () => {
      const world = makeWorld();
      vi.mocked(worldsApi.listWorlds).mockResolvedValue([world]);
      vi.mocked(worldsApi.deleteWorld).mockResolvedValue(undefined);

      const wrapper = mountCampaignSelect();
      await flushPromises();

      await wrapper.find('.campaign-row button:nth-of-type(2)').trigger('click');
      await flushPromises();
      expect(worldsApi.deleteWorld).not.toHaveBeenCalled();
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true);

      await wrapper.find('.delete-confirm button').trigger('click');
      await flushPromises();
      expect(worldsApi.deleteWorld).toHaveBeenCalledWith(world.id);
      expect(wrapper.text()).not.toContain(world.name);
    });

    it('cancels without calling deleteWorld', async () => {
      const world = makeWorld();
      vi.mocked(worldsApi.listWorlds).mockResolvedValue([world]);

      const wrapper = mountCampaignSelect();
      await flushPromises();

      await wrapper.find('.campaign-row button:nth-of-type(2)').trigger('click');
      await flushPromises();
      await wrapper.findAll('.delete-confirm button')[1]?.trigger('click');
      await flushPromises();

      expect(worldsApi.deleteWorld).not.toHaveBeenCalled();
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    });
  });
});
