// @vitest-environment jsdom
import { characterBuildSchema, type CharacterBuild } from '@hearthtable/pf2e';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../../api/compendium.js';
import SpellsStep from './SpellsStep.vue';

vi.mock('../../api/compendium.js');

const summary = (slug: string, traits: string[] = []) => ({
  packId: 'spells',
  slug,
  name: slug.replace(/^./, (c) => c.toUpperCase()),
  kind: 'spell',
  traits,
  rank: 1,
});

const buildFor = (slug: string, spells = { cantrips: [], ranked: [] }): CharacterBuild =>
  characterBuildSchema.parse({ class: { packId: 'classes', slug }, spells });

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(true);
  vi.mocked(compendiumApi.searchCompendium).mockImplementation((params) =>
    Promise.resolve(
      params?.trait === 'cantrip'
        ? [summary('zap', ['cantrip']), summary('glow', ['cantrip'])]
        : // Rank 1 search: cantrips are rank 1 too, and the step leaves them out.
          [summary('lull'), summary('zap', ['cantrip'])],
    ),
  );
});

function mountStep(build: CharacterBuild) {
  return mount(SpellsStep, { props: { build, classEntry: undefined } });
}

describe('SpellsStep', () => {
  it('says so for a class that does not cast, and asks for a class when there is none', async () => {
    expect(mountStep(buildFor('fighter')).text()).toContain('does not cast spells');
    expect(mountStep(characterBuildSchema.parse({})).text()).toContain(
      'Pick a class first',
    );
    await flushPromises();
    expect(compendiumApi.searchCompendium).not.toHaveBeenCalled();
  });

  it('lists the class’s cantrips and rank 1 spells from its own tradition', async () => {
    const wrapper = mountStep(buildFor('bard'));
    await flushPromises();
    expect(compendiumApi.searchCompendium).toHaveBeenCalledWith({
      kind: 'spell',
      tradition: 'occult',
      trait: 'cantrip',
      limit: 200,
    });
    expect(compendiumApi.searchCompendium).toHaveBeenCalledWith({
      kind: 'spell',
      tradition: 'occult',
      rank: 1,
      limit: 200,
    });
    const [cantrips, ranked] = wrapper.findAll('fieldset');
    expect(cantrips?.text()).toContain('0 of 5 chosen');
    expect(cantrips?.text()).toContain('Zap');
    expect(ranked?.find('legend').text()).toBe('Rank 1 spells you know');
    expect(ranked?.text()).toContain('Lull');
    expect(ranked?.text()).not.toContain('Zap');
  });

  it('emits a toggle for the list the box belongs to', async () => {
    const wrapper = mountStep(buildFor('bard'));
    await flushPromises();
    const [cantrips, ranked] = wrapper.findAll('fieldset');
    await cantrips?.find('input[type="checkbox"]').trigger('change');
    await ranked?.find('input[type="checkbox"]').trigger('change');
    expect(wrapper.emitted('toggle')).toEqual([
      ['cantrips', { packId: 'spells', slug: 'zap' }],
      ['ranked', { packId: 'spells', slug: 'lull' }],
    ]);
  });

  it('shows picks as checked and counts past the class’s cantrips in words', async () => {
    const zap = { packId: 'spells', slug: 'zap' };
    const glow = { packId: 'spells', slug: 'glow' };
    const many = Array.from({ length: 5 }, (_, i) => ({
      packId: 'spells',
      slug: `c${i}`,
    }));
    const wrapper = mountStep(
      buildFor('bard', { cantrips: [zap, glow, ...many] as never, ranked: [] }),
    );
    await flushPromises();
    const box = wrapper.find('fieldset input[type="checkbox"]');
    expect((box.element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.text()).toContain('7 of 5 chosen (2 more than your class has)');
  });

  it('lets another tradition’s list be browsed, with a note that it is off the class’s list', async () => {
    const wrapper = mountStep(buildFor('cleric'));
    await flushPromises();
    expect(wrapper.text()).not.toContain('not your class');
    await wrapper.find('select').setValue('arcane');
    await flushPromises();
    expect(wrapper.text()).toContain("This is not your class's list");
    expect(compendiumApi.searchCompendium).toHaveBeenLastCalledWith(
      expect.objectContaining({ tradition: 'arcane' }),
    );
  });

  it('asks a Witch to choose the list that goes with their patron', async () => {
    const wrapper = mountStep(buildFor('witch'));
    await flushPromises();
    expect(wrapper.text()).toContain('Your patron decides which list you cast from');
    expect(wrapper.text()).not.toContain('not your class');
  });

  it('says when no content has been imported', async () => {
    vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(false);
    const wrapper = mountStep(buildFor('bard'));
    await flushPromises();
    expect(wrapper.text()).toContain('No game content has been imported yet');
  });
});
