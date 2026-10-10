// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { AncestryEntry, CharacterBuild } from '@hearthtable/pf2e';
import { ancestryEntrySchema, characterBuildSchema } from '@hearthtable/pf2e';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../../api/compendium.js';
import AncestryStep from './AncestryStep.vue';

vi.mock('../../api/compendium.js');

const NOW = '2026-10-01T00:00:00.000Z';
const summary = (slug: string, name: string, kind: string, ancestrySlug?: string) => ({
  packId: kind === 'ancestry' ? 'ancestries' : 'heritages',
  slug,
  name,
  kind,
  traits: [],
  ...(ancestrySlug === undefined ? {} : { ancestrySlug }),
});

const ANCESTRY: AncestryEntry = ancestryEntrySchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'ancestries',
  slug: 'invented-folk',
  name: 'Invented Folk',
  kind: 'ancestry',
  provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
  ruleElements: [],
  description: '',
  hp: 8,
  size: 'medium',
  speed: 25,
  boosts: ['con', 'wis'],
  freeBoosts: 1,
  languages: ['common'],
  traits: [],
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(true);
  vi.mocked(compendiumApi.searchCompendium).mockImplementation((params = {}) =>
    Promise.resolve(
      params.kind === 'ancestry'
        ? [
            summary('invented-folk', 'Invented Folk', 'ancestry'),
            summary('other', 'Other', 'ancestry'),
          ]
        : params.ancestrySlug === 'invented-folk'
          ? [summary('hill', 'Hill Folk', 'heritage', 'invented-folk')]
          : [
              summary('hill', 'Hill Folk', 'heritage', 'invented-folk'),
              summary('changeling', 'Changeling', 'heritage'),
            ],
    ),
  );
});

async function mountStep(build: Partial<CharacterBuild> = {}, ancestry?: AncestryEntry) {
  const wrapper = mount(AncestryStep, {
    props: { build: characterBuildSchema.parse(build), ancestry },
  });
  await flushPromises();
  return wrapper;
}

describe('AncestryStep', () => {
  it('lists the ancestries as radio cards and reports a pick', async () => {
    const wrapper = await mountStep();
    expect(wrapper.findAll('.card .name').map((n) => n.text())).toEqual([
      'Invented Folk',
      'Other',
    ]);
    await wrapper.findAll('.card input')[0]?.setValue(true);
    expect(wrapper.emitted('pickAncestry')).toEqual([
      [{ packId: 'ancestries', slug: 'invented-folk' }],
    ]);
  });

  it('marks the chosen ancestry', async () => {
    const wrapper = await mountStep({
      ancestry: { packId: 'ancestries', slug: 'other' },
    });
    const checked = wrapper
      .findAll('.card input')
      .map((i) => (i.element as HTMLInputElement).checked);
    expect(checked).toEqual([false, true]);
  });

  it('shows what the chosen ancestry gives', async () => {
    const wrapper = await mountStep(
      { ancestry: { packId: 'ancestries', slug: 'invented-folk' } },
      ANCESTRY,
    );
    const text = wrapper.get('.details').text();
    expect(text).toContain('Invented Folk');
    expect(text).toContain('8');
    expect(text).toContain('Medium');
    expect(text).toContain('25 feet');
    expect(text).toContain('Constitution, Wisdom, 1 free');
    expect(text).toContain('Common');
  });

  it('offers this ancestry’s heritages first, then the versatile ones, and reports a pick', async () => {
    const wrapper = await mountStep(
      { ancestry: { packId: 'ancestries', slug: 'invented-folk' } },
      ANCESTRY,
    );
    expect(compendiumApi.searchCompendium).toHaveBeenCalledWith({
      kind: 'heritage',
      ancestrySlug: 'invented-folk',
      limit: 200,
    });
    const own = wrapper.findAll('fieldset:last-of-type > label').map((l) => l.text());
    expect(own).toEqual(['Hill Folk']);
    expect(wrapper.get('.versatile').text()).toContain('Changeling');
    expect(wrapper.get('.versatile').text()).not.toContain('Hill Folk');

    await wrapper.findAll('input[name="heritage"]')[1]?.setValue(true);
    expect(wrapper.emitted('pickHeritage')).toEqual([
      [{ packId: 'heritages', slug: 'changeling' }],
    ]);
  });

  it('shows no heritage choice until an ancestry is picked', async () => {
    const wrapper = await mountStep();
    expect(wrapper.find('input[name="heritage"]').exists()).toBe(false);
  });

  it('says so, and offers nothing, when no content has been imported', async () => {
    vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(false);
    const wrapper = await mountStep();
    expect(wrapper.text()).toContain('No game content has been imported');
    expect(wrapper.find('.card').exists()).toBe(false);
    expect(compendiumApi.searchCompendium).not.toHaveBeenCalled();
  });

  it('shows the reason when the compendium cannot be read', async () => {
    vi.mocked(compendiumApi.isCompendiumAvailable).mockRejectedValue(
      new Error('offline'),
    );
    const wrapper = await mountStep();
    expect(wrapper.get('[role="alert"]').text()).toBe('offline');
  });
});
