// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api/contentImport.js';
import ContentImportPanel from './ContentImportPanel.vue';

vi.mock('../api/contentImport.js');

const NOW = '2026-09-30T00:00:00.000Z';
const empty = { available: false, entryCount: 0 };
const loaded = { available: true, entryCount: 3107 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.mocked(api.getContentStatus).mockResolvedValue(empty);
  vi.mocked(api.getImportStatus).mockResolvedValue({ state: 'idle' });
});

afterEach(() => {
  vi.useRealTimers();
});

async function mountPanel() {
  const wrapper = mount(ContentImportPanel);
  await flushPromises();
  return wrapper;
}

describe('with no content yet', () => {
  it('is the first thing to do: plain words, no jargon, one button', async () => {
    const wrapper = await mountPanel();
    expect(wrapper.find('h2').text()).toBe('This table has no game content yet');
    expect(wrapper.text()).toContain('downloads it onto this computer');
    expect(wrapper.text()).toContain('nothing is uploaded');
    expect(wrapper.text()).not.toMatch(/importer|terminal|pnpm/i);
    expect(wrapper.find('button').text()).toBe('Import game content');
    expect(wrapper.find('section').classes()).toContain('prominent');
  });

  it('carries the ORC attribution', async () => {
    expect((await mountPanel()).find('.notice').text()).toContain('ORC license');
  });

  it('starts the import and says it is running, with the time that has passed', async () => {
    vi.mocked(api.startImport).mockResolvedValue({ state: 'running', startedAt: NOW });
    const wrapper = await mountPanel();

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(api.startImport).toHaveBeenCalledTimes(1);
    const status = wrapper.find('[role="status"]');
    expect(status.text()).toContain('Importing game content');
    expect(status.text()).toContain('a minute or two');
    expect(wrapper.find('button').exists()).toBe(false);
  });
});

describe('while it runs', () => {
  it('checks the status every couple of seconds, and on finishing reloads the count and tells the parent', async () => {
    vi.mocked(api.getImportStatus)
      .mockResolvedValueOnce({ state: 'running', startedAt: NOW })
      .mockResolvedValueOnce({ state: 'running', startedAt: NOW })
      .mockResolvedValue({ state: 'done', finishedAt: NOW, entryCount: 3107 });
    vi.mocked(api.getContentStatus)
      .mockResolvedValueOnce(empty)
      .mockResolvedValue(loaded);

    const wrapper = await mountPanel();
    expect(wrapper.find('[role="status"]').text()).toContain('Importing');

    await vi.advanceTimersByTimeAsync(2000);
    expect(wrapper.find('[role="status"]').text()).toContain('Importing');
    expect(wrapper.emitted('imported')).toBeUndefined();

    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();

    expect(wrapper.emitted('imported')).toHaveLength(1);
    expect(wrapper.find('summary').text()).toBe('Game content: 3,107 entries loaded');
    expect(wrapper.find('section').classes()).not.toContain('prominent');

    // Polling stopped.
    const calls = vi.mocked(api.getImportStatus).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(vi.mocked(api.getImportStatus).mock.calls.length).toBe(calls);
  });

  it('stops polling when the panel goes away', async () => {
    vi.mocked(api.getImportStatus).mockResolvedValue({
      state: 'running',
      startedAt: NOW,
    });
    const wrapper = await mountPanel();
    wrapper.unmount();
    const calls = vi.mocked(api.getImportStatus).mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(vi.mocked(api.getImportStatus).mock.calls.length).toBe(calls);
  });
});

describe('when it fails', () => {
  const failed = {
    state: 'failed' as const,
    finishedAt: NOW,
    message:
      'Git is not installed on this computer (or is not on its PATH). Install Git, then try again.',
    detail: 'spawnSync git ENOENT',
  };

  it('says why in a sentence, keeps the detail behind a disclosure, and offers to try again', async () => {
    vi.mocked(api.getImportStatus).mockResolvedValue(failed);
    const wrapper = await mountPanel();

    expect(wrapper.find('[role="alert"]').text()).toContain('Git is not installed');
    expect(wrapper.find('details.detail summary').text()).toBe('Technical details');
    expect(wrapper.find('details.detail pre').text()).toBe('spawnSync git ENOENT');
    expect(wrapper.find('button').text()).toBe('Try again');
  });

  it('tries again from the same button', async () => {
    vi.mocked(api.getImportStatus).mockResolvedValue(failed);
    vi.mocked(api.startImport).mockResolvedValue({ state: 'running', startedAt: NOW });
    const wrapper = await mountPanel();
    await wrapper.find('button').trigger('click');
    expect(api.startImport).toHaveBeenCalledTimes(1);
  });
});

describe('with content loaded', () => {
  beforeEach(() => {
    vi.mocked(api.getContentStatus).mockResolvedValue(loaded);
  });

  it('folds down to one quiet line', async () => {
    const wrapper = await mountPanel();
    expect(wrapper.find('summary').text()).toBe('Game content: 3,107 entries loaded');
    expect(wrapper.find('section').classes()).not.toContain('prominent');
    expect(wrapper.find('h2').exists()).toBe(false);
  });

  it('can import again, deliberately, from inside the fold', async () => {
    vi.mocked(api.startImport).mockResolvedValue({ state: 'running', startedAt: NOW });
    const wrapper = await mountPanel();
    await wrapper.find('details.loaded button').trigger('click');
    expect(api.startImport).toHaveBeenCalledTimes(1);
  });
});

describe('when the server cannot be asked', () => {
  it('shows the problem in words instead of nothing', async () => {
    vi.mocked(api.getContentStatus).mockRejectedValue(new Error('offline'));
    const wrapper = await mountPanel();
    expect(wrapper.find('[role="alert"]').text()).toBe('offline');
  });

  it('shows a refusal from the server, such as not being the GM', async () => {
    vi.mocked(api.startImport).mockRejectedValue(
      new Error('only the GM can import game content'),
    );
    const wrapper = await mountPanel();
    await wrapper.find('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'only the GM can import game content',
    );
  });
});
