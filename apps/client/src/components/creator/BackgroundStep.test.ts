// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { BackgroundEntry, CharacterBuild } from '@hearthtable/pf2e';
import { backgroundEntrySchema, characterBuildSchema } from '@hearthtable/pf2e';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../../api/compendium.js';
import BackgroundStep from './BackgroundStep.vue';

vi.mock('../../api/compendium.js');

const NOW = '2026-10-01T00:00:00.000Z';
const summary = (slug: string, name: string) => ({
  packId: 'backgrounds',
  slug,
  name,
  kind: 'background',
  traits: [],
});

const BACKGROUND: BackgroundEntry = backgroundEntrySchema.parse({
  id: '22222222-2222-4222-8222-222222222222',
  schemaVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  packId: 'backgrounds',
  slug: 'invented-background',
  name: 'Invented Background',
  kind: 'background',
  provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
  ruleElements: [{ kind: 'grantItem', packId: 'feats', slug: 'invented-lore-feat' }],
  description: '',
  boostOptions: ['str', 'dex'],
  trainedSkills: ['athletics', 'invented-lore'],
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(true);
  vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
    summary('invented-background', 'Invented Background'),
    summary('other', 'Other'),
  ]);
});

async function mountStep(
  build: Partial<CharacterBuild> = {},
  background?: BackgroundEntry,
) {
  const wrapper = mount(BackgroundStep, {
    props: { build: characterBuildSchema.parse(build), background },
  });
  await flushPromises();
  return wrapper;
}

describe('BackgroundStep', () => {
  it('lists the backgrounds as radios and reports a pick', async () => {
    const wrapper = await mountStep();
    expect(compendiumApi.searchCompendium).toHaveBeenCalledWith({
      kind: 'background',
      q: '',
      limit: 200,
    });
    expect(wrapper.findAll('.row').map((r) => r.text())).toEqual([
      'Invented Background',
      'Other',
    ]);
    await wrapper.findAll('input[name="background"]')[1]?.setValue(true);
    expect(wrapper.emitted('pickBackground')).toEqual([
      [{ packId: 'backgrounds', slug: 'other' }],
    ]);
  });

  it('marks the chosen background', async () => {
    const wrapper = await mountStep({
      background: { packId: 'backgrounds', slug: 'other' },
    });
    const checked = wrapper
      .findAll('input[name="background"]')
      .map((i) => (i.element as HTMLInputElement).checked);
    expect(checked).toEqual([false, true]);
  });

  it('searches by name', async () => {
    const wrapper = await mountStep();
    await wrapper.get('#background-q').setValue(' acolyte ');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(compendiumApi.searchCompendium).toHaveBeenLastCalledWith({
      kind: 'background',
      q: 'acolyte',
      limit: 200,
    });
  });

  it('shows what the background gives: the boost choice, the skills and the granted feat', async () => {
    const wrapper = await mountStep(
      { background: { packId: 'backgrounds', slug: 'invented-background' } },
      BACKGROUND,
    );
    const text = wrapper.get('.details').text();
    expect(text).toContain('Strength or Dexterity, plus one free');
    expect(text).toContain('Athletics, Invented Lore');
    expect(text).toContain('Invented Lore Feat');
  });

  it('says so, and offers nothing, when no content has been imported', async () => {
    vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(false);
    const wrapper = await mountStep();
    expect(wrapper.text()).toContain('No game content has been imported');
    expect(compendiumApi.searchCompendium).not.toHaveBeenCalled();
  });

  it('shows the reason when the compendium cannot be read, and when a search fails', async () => {
    vi.mocked(compendiumApi.isCompendiumAvailable).mockRejectedValue(
      new Error('offline'),
    );
    expect((await mountStep()).get('[role="alert"]').text()).toBe('offline');

    vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(true);
    vi.mocked(compendiumApi.searchCompendium).mockRejectedValue(new Error('boom'));
    expect((await mountStep()).get('[role="alert"]').text()).toBe('boom');
  });
});
