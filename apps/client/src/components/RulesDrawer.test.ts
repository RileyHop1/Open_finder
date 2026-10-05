// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../api/compendium.js';
import RulesDrawer from './RulesDrawer.vue';

vi.mock('../api/compendium.js');

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([]);
  vi.mocked(compendiumApi.getCompendiumTraits).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the table of contents', () => {
  it('lists every book page, and shows the first one chosen reads its full text', async () => {
    const wrapper = mount(RulesDrawer);
    const toc = wrapper.findAll('nav button');
    expect(toc.length).toBeGreaterThan(0);
    expect(toc.map((b) => b.text())).toContain('Proficiency');

    const proficiency = toc.find((b) => b.text() === 'Proficiency');
    await proficiency?.trigger('click');

    expect(wrapper.find('.page-body h3').text()).toBe('Proficiency');
    expect(wrapper.find('.page-body').text()).toContain('Untrained');
    expect(proficiency?.attributes('aria-pressed')).toBe('true');
  });

  it('marks only the chosen page as pressed', async () => {
    const wrapper = mount(RulesDrawer);
    const toc = wrapper.findAll('nav button');
    await toc[0]?.trigger('click');
    expect(toc[0]?.attributes('aria-pressed')).toBe('true');
    expect(toc[1]?.attributes('aria-pressed')).toBe('false');
  });
});

describe('search', () => {
  it('hides the table of contents and searches once submitted', async () => {
    vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
      {
        packId: 'feats',
        slug: 'invented-feat',
        name: 'Invented Feat',
        kind: 'feat',
        traits: [],
      },
    ]);
    vi.mocked(compendiumApi.getCompendiumTraits).mockResolvedValue([
      { slug: 'agile', name: 'Agile', text: [{ kind: 'text', value: 'Reduces MAP.' }] },
    ]);

    const wrapper = mount(RulesDrawer);
    await wrapper.find('#rules-q').setValue('a');
    expect(wrapper.find('nav').exists()).toBe(false);

    await wrapper.find('form.search').trigger('submit');
    await flushPromises();

    expect(wrapper.find('nav').exists()).toBe(false);
    expect(compendiumApi.searchCompendium).toHaveBeenCalledWith({ q: 'a', limit: 8 });
    expect(wrapper.find('#rules-compendium-heading').exists()).toBe(true);
    expect(wrapper.text()).toContain('Invented Feat');
    expect(wrapper.find('#rules-traits-heading').exists()).toBe(true);
    expect(wrapper.text()).toContain('Agile');
  });

  it('matches a book page by title too, and choosing it clears the query', async () => {
    const wrapper = mount(RulesDrawer);
    await wrapper.find('#rules-q').setValue('proficiency');
    await wrapper.find('form.search').trigger('submit');
    await flushPromises();

    expect(wrapper.find('#rules-pages-heading').exists()).toBe(true);
    const pageMatch = wrapper
      .findAll('.result-list button')
      .find((b) => b.text() === 'Proficiency');
    await pageMatch?.trigger('click');

    expect(wrapper.find<HTMLInputElement>('#rules-q').element.value).toBe('');
    expect(wrapper.find('.page-body h3').text()).toBe('Proficiency');
  });

  it('says so when nothing matches at all', async () => {
    const wrapper = mount(RulesDrawer);
    await wrapper.find('#rules-q').setValue('zzz-no-such-thing');
    await wrapper.find('form.search').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.empty').text()).toContain('Nothing matches');
  });

  it('fetches the trait glossary once, even across repeated searches', async () => {
    const wrapper = mount(RulesDrawer);
    await wrapper.find('#rules-q').setValue('a');
    await wrapper.find('form.search').trigger('submit');
    await flushPromises();
    await wrapper.find('#rules-q').setValue('b');
    await wrapper.find('form.search').trigger('submit');
    await flushPromises();

    expect(compendiumApi.getCompendiumTraits).toHaveBeenCalledTimes(1);
  });

  it('clearing the box brings the table of contents back without a stale result list', async () => {
    vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
      {
        packId: 'feats',
        slug: 'invented-feat',
        name: 'Invented Feat',
        kind: 'feat',
        traits: [],
      },
    ]);
    const wrapper = mount(RulesDrawer);
    await wrapper.find('#rules-q').setValue('invented');
    await wrapper.find('form.search').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('Invented Feat');

    await wrapper.find('#rules-q').setValue('');
    expect(wrapper.find('nav').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Invented Feat');
  });

  it('shows a compendium match whose kind has no tooltip mapping as plain text, not a broken RulesTerm', async () => {
    vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
      {
        packId: 'equipment',
        slug: 'invented-sword',
        name: 'Invented Sword',
        kind: 'weapon',
        traits: [],
      },
    ]);
    const wrapper = mount(RulesDrawer);
    await wrapper.find('#rules-q').setValue('sword');
    await wrapper.find('form.search').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Invented Sword');
    expect(wrapper.text()).toContain('(weapon)');
    expect(
      wrapper
        .find('#rules-compendium-heading')
        .element.nextElementSibling?.querySelector('button'),
    ).toBeNull();
  });

  it('reports a search failure rather than showing stale or empty results silently', async () => {
    vi.mocked(compendiumApi.getCompendiumTraits).mockRejectedValue(new Error('offline'));
    const wrapper = mount(RulesDrawer);
    await wrapper.find('#rules-q').setValue('a');
    await wrapper.find('form.search').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toContain('offline');
  });
});
