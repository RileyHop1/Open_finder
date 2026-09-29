// @vitest-environment jsdom
import type { World } from '@hearthtable/core';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as seatsApi from './api/seats.js';
import * as worldsApi from './api/worlds.js';
import App from './App.vue';

// CampaignLobby (rendered once a campaign is active) opens a real Socket.IO
// connection on mount -- mocked here (with a stub socket, so the store's own
// `.on(...)`/`.connect()` calls have something to call) so App.vue's own
// tests never attempt a real network connection just to check which screen
// is showing.
vi.mock('./realtime/socket.js', () => ({
  createSocket: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  emitOperation: vi.fn(),
}));
vi.mock('./api/worlds.js');
vi.mock('./api/seats.js');

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

function mountApp() {
  return mount(App, {
    global: { plugins: [createPinia()] },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(worldsApi.listWorlds).mockResolvedValue([]);
  vi.mocked(worldsApi.getActiveWorld).mockResolvedValue(undefined);
  vi.mocked(seatsApi.listSeats).mockResolvedValue([]);
});

describe('App', () => {
  it('renders the shell', async () => {
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.text()).toContain('Hearthtable');
  });

  it('has a skip link as the first focusable element, for keyboard users', async () => {
    const wrapper = mountApp();
    await flushPromises();
    const skipLink = wrapper.find('a.skip-link');
    expect(skipLink.exists()).toBe(true);
    expect(skipLink.attributes('href')).toBe('#main-content');
  });

  it('has a #main-content landmark the skip link points to', async () => {
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find('main#main-content').exists()).toBe(true);
  });

  it('shows CampaignSelect when no campaign is active', async () => {
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.text()).toContain('Campaigns');
    expect(wrapper.text()).not.toContain('No seats yet');
  });

  it('shows CampaignLobby once a campaign is active', async () => {
    const active = makeWorld({ name: 'Active Campaign' });
    vi.mocked(worldsApi.listWorlds).mockResolvedValue([active]);
    vi.mocked(worldsApi.getActiveWorld).mockResolvedValue(active);

    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.text()).toContain('Active Campaign');
    expect(wrapper.text()).not.toContain('New campaign name');
  });
});
