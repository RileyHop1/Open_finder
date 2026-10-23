// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { classFeatureEntrySchema, characterBuildSchema } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import ClassChoicesStep from './ClassChoicesStep.vue';

const NOW = '2026-10-01T00:00:00.000Z';
const feature = (slug: string, extra: Record<string, unknown> = {}) =>
  classFeatureEntrySchema.parse({
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'classFeatures',
    slug,
    name: slug,
    kind: 'classFeature',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
    classSlugs: ['invented'],
    level: 1,
    ...extra,
  });

const instinct = feature('instinct', {
  ruleElements: [
    {
      kind: 'choiceSet',
      prompt: 'Choose Instinct',
      choices: [
        { label: 'Wolf', value: 'wolf' },
        { label: 'Bear', value: 'bear' },
      ],
      rollOptionPrefix: 'instinct',
      grantsFromPackId: 'classFeatures',
    },
  ],
});
const wolf = feature('wolf', {
  tags: ['instinct'],
  text: [
    { kind: 'paragraph', children: [{ kind: 'text', value: 'Howls at the moon.' }] },
  ],
});
const bear = feature('bear', { tags: ['instinct'] });

const build = (classChoices: Record<string, string> = {}, withClass = true) =>
  characterBuildSchema.parse({
    ...(withClass ? { class: { packId: 'classes', slug: 'invented' } } : {}),
    flaws: [],
    boosts: [],
    trainedSkills: [],
    skillIncreases: [],
    feats: [],
    languages: [],
    classChoices,
  });

const mountStep = (props: Record<string, unknown>) =>
  mount(ClassChoicesStep, { props: { classEntry: undefined, ...props } as never });

describe('ClassChoicesStep', () => {
  it('asks to pick a class first', () => {
    const wrapper = mountStep({ build: build({}, false), features: [] });
    expect(wrapper.text()).toContain('Pick a class first');
  });

  it('says it is loading while the features are not here yet', () => {
    const wrapper = mountStep({ build: build(), features: undefined });
    expect(wrapper.text()).toContain('Loading');
  });

  it('says so when the class has no choices at level 1', () => {
    const wrapper = mountStep({ build: build(), features: [feature('plain')] });
    expect(wrapper.text()).toContain('no choices to make');
  });

  it('shows each option with what it gives, and emits the pick', async () => {
    const wrapper = mountStep({ build: build(), features: [instinct, wolf, bear] });

    expect(wrapper.text()).toContain('Choose Instinct');
    expect(wrapper.text()).toContain('not chosen yet');
    expect(wrapper.text()).toContain('Howls at the moon.');
    const radios = wrapper.findAll('input[type="radio"]');
    expect(radios).toHaveLength(2);

    await radios[1]?.setValue(true);
    expect(wrapper.emitted('pick')).toEqual([['instinct', 'bear']]);
  });

  it('marks the chosen option and warns about one the class does not offer', () => {
    const chosen = mountStep({
      build: build({ instinct: 'wolf' }),
      features: [instinct, wolf, bear],
    });
    expect(chosen.findAll('.option.chosen')).toHaveLength(1);
    expect(chosen.text()).not.toContain('not chosen yet');

    const off = mountStep({
      build: build({ instinct: 'dragon' }),
      features: [instinct, wolf, bear],
    });
    expect(off.get('.warning').text()).toContain('dragon is not one of the options');
  });

  it('asks a class that serves a deity for its facts, and passes them on', async () => {
    const cleric = characterBuildSchema.parse({
      class: { packId: 'classes', slug: 'cleric' },
    });
    const wrapper = mountStep({ build: cleric, features: [] });
    expect(wrapper.text()).toContain('Your deity');
    await wrapper.get('.deity select').setValue('religion');
    expect(wrapper.emitted('deity')).toEqual([[{ skill: 'religion' }]]);
    expect(mountStep({ build: build(), features: [] }).text()).not.toContain(
      'Your deity',
    );
  });
});
