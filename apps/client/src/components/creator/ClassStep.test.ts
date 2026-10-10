// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { Attribute, CharacterBuild, ClassEntry } from '@hearthtable/pf2e';
import { characterBuildSchema, classEntrySchema } from '@hearthtable/pf2e';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../../api/compendium.js';
import ClassStep from './ClassStep.vue';

vi.mock('../../api/compendium.js');

const NOW = '2026-10-01T00:00:00.000Z';
const summary = (slug: string, name: string) => ({
  packId: 'classes',
  slug,
  name,
  kind: 'class',
  traits: [],
});

function classOf(slug: string, keyAttributeOptions: Attribute[]): ClassEntry {
  return classEntrySchema.parse({
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'classes',
    slug,
    name: slug,
    kind: 'class',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    ruleElements: [],
    description: '',
    keyAttributeOptions,
    hpPerLevel: 10,
    proficiencies: {
      perception: { expert: 1 },
      savingThrows: {
        fortitude: { expert: 1 },
        reflex: { trained: 1 },
        will: { trained: 1 },
      },
      classDc: { trained: 1 },
      weapons: {
        unarmed: {},
        simple: { trained: 1 },
        martial: { expert: 1 },
        advanced: {},
      },
      armor: { unarmored: { trained: 1 }, light: {}, medium: {}, heavy: { trained: 1 } },
    },
    skills: { trainedSkillCount: 3, automaticallyTrained: ['athletics'] },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(true);
  vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
    summary('wizard', 'Wizard'),
    summary('fighter', 'Fighter'),
    summary('rogue', 'Rogue'),
  ]);
});

async function mountStep(
  build: Partial<CharacterBuild> = {},
  classEntry?: ClassEntry,
  keyAttribute?: Attribute,
) {
  const wrapper = mount(ClassStep, {
    props: { build: characterBuildSchema.parse(build), classEntry, keyAttribute },
  });
  await flushPromises();
  return wrapper;
}

describe('ClassStep', () => {
  it('lists the martial classes first as cards, and the rest under a note that their setup comes later', async () => {
    const wrapper = await mountStep();
    expect(wrapper.findAll('.cards .name').map((n) => n.text())).toEqual([
      'Fighter',
      'Rogue',
    ]);
    const later = wrapper.get('.later');
    expect(later.text()).toContain('Wizard');
    expect(later.text()).toContain('set up in a later update');
    expect(later.text()).not.toContain('Fighter');
  });

  it('reports a pick from either list', async () => {
    const wrapper = await mountStep();
    await wrapper.findAll('input[name="class"]')[0]?.setValue(true);
    await wrapper.findAll('input[name="class"]')[2]?.setValue(true);
    expect(wrapper.emitted('pickClass')).toEqual([
      [{ packId: 'classes', slug: 'fighter' }],
      [{ packId: 'classes', slug: 'wizard' }],
    ]);
  });

  it('shows Hit Points, trained skills, and the starting proficiencies in words', async () => {
    const wrapper = await mountStep(
      { class: { packId: 'classes', slug: 'fighter' } },
      classOf('fighter', ['str', 'dex']),
    );
    const text = wrapper.get('.details').text();
    expect(text).toContain('10 plus Constitution, per level');
    expect(text).toContain('3 plus Intelligence, and Athletics');
    const row = (label: string) =>
      wrapper
        .findAll('.proficiencies tr')
        .find((r) => r.get('th').text() === label)
        ?.get('td')
        .text();
    expect(row('Perception')).toBe('Expert');
    expect(row('Will')).toBe('Trained');
    expect(row('Martial weapons')).toBe('Expert');
    expect(row('Advanced weapons')).toBe('Untrained');
    expect(row('Heavy armor')).toBe('Trained');
    expect(row('Medium armor')).toBe('Untrained');
    expect(row('Class DC')).toBe('Trained');
  });

  it('asks for the key attribute only when the class offers a choice, defaulting to the first', async () => {
    const choice = await mountStep(
      { class: { packId: 'classes', slug: 'fighter' } },
      classOf('fighter', ['str', 'dex']),
    );
    const radios = choice.findAll('input[name="key-attribute"]');
    expect(radios.map((r) => (r.element as HTMLInputElement).checked)).toEqual([
      true,
      false,
    ]);
    await radios[1]?.setValue(true);
    expect(choice.emitted('pickKeyAttribute')).toEqual([['dex']]);

    const chosenDex = await mountStep(
      { class: { packId: 'classes', slug: 'fighter' } },
      classOf('fighter', ['str', 'dex']),
      'dex',
    );
    expect(
      chosenDex
        .findAll('input[name="key-attribute"]')
        .map((r) => (r.element as HTMLInputElement).checked),
    ).toEqual([false, true]);

    const fixed = await mountStep(
      { class: { packId: 'classes', slug: 'rogue' } },
      classOf('rogue', ['dex']),
    );
    expect(fixed.find('input[name="key-attribute"]').exists()).toBe(false);
    expect(fixed.get('.details').text()).toContain('Dexterity');
  });

  it('warns visibly when the chosen class is not fully set up yet, and not for a martial one', async () => {
    const wizard = await mountStep(
      { class: { packId: 'classes', slug: 'wizard' } },
      classOf('wizard', ['int']),
    );
    expect(wizard.get('.warning').text()).toContain('not fully set up yet');
    expect(wizard.get('.later').attributes('open')).toBeDefined();

    const fighter = await mountStep(
      { class: { packId: 'classes', slug: 'fighter' } },
      classOf('fighter', ['str']),
    );
    expect(fighter.find('.warning').exists()).toBe(false);
  });

  it('says so when no content has been imported, and shows the reason when loading fails', async () => {
    vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(false);
    expect((await mountStep()).text()).toContain('No game content has been imported');
    vi.mocked(compendiumApi.isCompendiumAvailable).mockRejectedValue(
      new Error('offline'),
    );
    expect((await mountStep()).get('[role="alert"]').text()).toBe('offline');
  });
});
