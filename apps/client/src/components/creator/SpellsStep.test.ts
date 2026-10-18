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

  it('casts from the patron’s list once the patron is chosen, and lists its gifts', async () => {
    const wrapper = mountStep(
      characterBuildSchema.parse({
        class: { packId: 'classes', slug: 'witch' },
        classChoices: { patron: 'the-resentment' },
      }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain('Your patron gives you the Occult list.');
    expect(compendiumApi.searchCompendium).toHaveBeenCalledWith(
      expect.objectContaining({ tradition: 'occult' }),
    );
    const gifts = wrapper.get('[aria-labelledby="spells-gifts-title"]').text();
    expect(gifts).toContain('Evil Eye');
    expect(gifts).toContain('Enfeeble');
    expect(gifts).toContain('1 Focus Point');
  });

  it('asks a Witch for a first hex, and emits the one picked', async () => {
    const wrapper = mountStep(buildFor('witch'));
    await flushPromises();
    const choice = wrapper.get('fieldset.spell-choice');
    expect(choice.get('legend').text()).toBe('Choose your first hex (a focus spell)');
    expect(choice.text()).toContain('Patrons Puppet');
    expect(choice.text()).toContain('Phase Familiar');
    await choice.findAll('input[type="radio"]')[1]?.trigger('change');
    expect(wrapper.emitted('pick')).toEqual([['first-hex', 'phase-familiar']]);
  });

  it('asks a Wilding Steward witch for the familiar’s spell too, and checks the one chosen', async () => {
    const wrapper = mountStep(
      characterBuildSchema.parse({
        class: { packId: 'classes', slug: 'witch' },
        classChoices: { patron: 'wilding-steward', 'familiar-spell': 'summon-animal' },
      }),
    );
    await flushPromises();
    const [, familiar] = wrapper.findAll('fieldset.spell-choice');
    expect(familiar?.get('legend').text()).toBe('Choose your familiar spell');
    const radios = familiar?.findAll<HTMLInputElement>('input[type="radio"]') ?? [];
    expect(radios.map((r) => r.element.checked)).toEqual([true, false]);
  });

  it('counts a Bard’s rank 1 picks against its repertoire, in words past it', async () => {
    const two = [
      { packId: 'spells', slug: 'a' },
      { packId: 'spells', slug: 'b' },
      { packId: 'spells', slug: 'c' },
    ];
    const wrapper = mountStep(buildFor('bard', { cantrips: [], ranked: two as never }));
    await flushPromises();
    expect(wrapper.findAll('fieldset')[1]?.text()).toContain(
      '3 of 2 chosen (1 more than your repertoire holds)',
    );
  });

  it('lists what the Bard’s class gives, and that the muse adds a spell once chosen', async () => {
    const wrapper = mountStep(buildFor('bard'));
    await flushPromises();
    const gifts = wrapper.get('[aria-labelledby="spells-gifts-title"]');
    expect(gifts.text()).toContain('Courageous Anthem');
    expect(gifts.text()).toContain('Counter Performance');
    expect(gifts.text()).toContain('1 Focus Point');
    expect(gifts.text()).toContain('Your muse adds a spell once you choose it');

    await wrapper.setProps({
      build: characterBuildSchema.parse({
        class: { packId: 'classes', slug: 'bard' },
        classChoices: { muse: 'enigma' },
      }),
    });
    expect(wrapper.text()).toContain('Sure Strike');
    expect(wrapper.text()).toContain('from your muse');
    expect(wrapper.text()).not.toContain('Your muse adds a spell');
  });

  it('shows a Cleric’s Divine Font: Heal or Harm until the font is chosen, then the one', async () => {
    const wrapper = mountStep(buildFor('cleric'));
    await flushPromises();
    const gifts = wrapper.get('[aria-labelledby="spells-gifts-title"]');
    expect(gifts.text()).toContain('Divine Font: 4 extra slots at your highest rank');
    expect(gifts.text()).toContain('Heal or Harm, once you choose your font');

    await wrapper.setProps({
      build: characterBuildSchema.parse({
        class: { packId: 'classes', slug: 'cleric' },
        classChoices: { 'divine-font': 'heal' },
      }),
    });
    const chosen = wrapper.get('[aria-labelledby="spells-gifts-title"]').text();
    expect(chosen).not.toContain('once you choose');
    expect(chosen).toMatch(/each holding\s+Heal/);
  });

  it('shows no class gifts for a caster with none, and counts a prepared caster’s picks plainly', async () => {
    const oracle = mountStep(buildFor('oracle'));
    await flushPromises();
    expect(oracle.find('[aria-labelledby="spells-gifts-title"]').exists()).toBe(false);
    const wizard = mountStep(buildFor('wizard'));
    await flushPromises();
    expect(wizard.findAll('fieldset.picks')[1]?.text()).toContain('0 chosen');
  });

  it('names a Wizard’s school spell and curriculum once the school is chosen', async () => {
    const wrapper = mountStep(
      characterBuildSchema.parse({
        class: { packId: 'classes', slug: 'wizard' },
        classChoices: { arcaneSchool: 'school-of-battle-magic' },
      }),
    );
    await flushPromises();
    const gifts = wrapper.get('[aria-labelledby="spells-gifts-title"]').text();
    expect(gifts).toContain('Force Bolt');
    expect(gifts).toContain('Curriculum: 1 extra cantrip and 1 extra slot at each rank');
    expect(gifts).toContain('1 Focus Point');
  });

  it('tells a Druid its order adds a spell, in words', async () => {
    const wrapper = mountStep(buildFor('druid'));
    await flushPromises();
    const gifts = wrapper.get('[aria-labelledby="spells-gifts-title"]');
    expect(gifts.text()).toContain('1 Focus Point');
    expect(gifts.text()).toContain('Your druidic order adds a spell once you choose it');
  });

  it('says when no content has been imported', async () => {
    vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(false);
    const wrapper = mountStep(buildFor('bard'));
    await flushPromises();
    expect(wrapper.text()).toContain('No game content has been imported yet');
  });
});
