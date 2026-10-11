// @vitest-environment jsdom
import type { AncestryEntry, BackgroundEntry, ClassEntry } from '@hearthtable/pf2e';
import { characterBuildSchema } from '@hearthtable/pf2e';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../../api/compendium.js';
import FeatsStep from './FeatsStep.vue';

vi.mock('../../api/compendium.js');

// Everything below is invented (ADR 0013).
const feat = (
  slug: string,
  category: string,
  traits: string[],
  prerequisites: string[] = [],
) => ({
  packId: 'feats',
  slug,
  name: slug,
  kind: 'feat',
  traits,
  level: 1,
  category,
  prerequisites,
});

const cls = {
  name: 'Vanguard',
  slug: 'vanguard',
  skills: { trainedSkillCount: 2, automaticallyTrained: ['athletics'] },
} as unknown as ClassEntry;
const ancestry = { name: 'Folk', slug: 'invented-folk' } as unknown as AncestryEntry;
const background = { trainedSkills: [] } as unknown as BackgroundEntry;

const build = (feats: unknown[] = []) =>
  characterBuildSchema.parse({
    flaws: [],
    boosts: [],
    trainedSkills: [],
    skillIncreases: [],
    feats,
    languages: [],
    classChoices: {},
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(compendiumApi.searchCompendium).mockImplementation((params) =>
    Promise.resolve(
      params?.category === 'ancestry'
        ? [feat('wide-stance', 'ancestry', ['invented-folk'])]
        : [
            feat('sudden-charge', 'class', ['vanguard']),
            feat('arcane-trick', 'class', ['vanguard'], ['trained in Arcana']),
            feat('shield-drill', 'class', ['vanguard'], ['trained in Athletics']),
          ],
    ),
  );
});

const mountStep = async (props: Record<string, unknown> = {}) => {
  const wrapper = mount(FeatsStep, {
    props: {
      build: build(),
      ancestry,
      background,
      classEntry: cls,
      ...props,
    } as never,
  });
  await flushPromises();
  return wrapper;
};

describe('FeatsStep', () => {
  it('has an ancestry and a class slot at level 1, each narrowed by the character’s own trait', async () => {
    const wrapper = await mountStep();
    expect(wrapper.findAll('legend').map((l) => l.text())).toEqual([
      'Ancestry feat (level 1)',
      'Class feat (level 1)',
    ]);
    const calls = vi.mocked(compendiumApi.searchCompendium).mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual(
      expect.objectContaining({
        category: 'ancestry',
        trait: 'invented-folk',
        maxLevel: 1,
      }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ category: 'class', trait: 'vanguard', maxLevel: 1 }),
    );
  });

  it('shows prerequisites in words with whether they are met, valid feats first', async () => {
    const wrapper = await mountStep();
    const classSlot = wrapper.findAll('fieldset')[1];
    const names = classSlot?.findAll('.feat .name').map((n) => n.text());
    expect(names).toEqual(['shield-drill', 'sudden-charge', 'arcane-trick']);
    expect(classSlot?.text()).toContain('trained in Athletics (✓ met)');
    expect(classSlot?.text()).toContain('trained in Arcana (✗ not met)');
  });

  it('emits the slot, level and feat on a pick, and the clear', async () => {
    const wrapper = await mountStep();
    await wrapper
      .findAll('fieldset')[1]
      ?.findAll('input[type="radio"]')[1]
      ?.setValue(true);
    expect(wrapper.emitted('pick')).toEqual([
      ['class', 1, { packId: 'feats', slug: 'sudden-charge' }],
    ]);

    const chosen = await mountStep({
      build: build([
        { slot: 'class', level: 1, feat: { packId: 'feats', slug: 'sudden-charge' } },
      ]),
    });
    await chosen.get('.clear').trigger('click');
    expect(chosen.emitted('pick')).toEqual([['class', 1, undefined]]);
  });

  it('lifts the narrowing on request, and says so when the pick is off the list', async () => {
    const wrapper = await mountStep();
    const slot = wrapper.findAll('fieldset')[0];
    await slot?.get('.all input').setValue(true);
    await flushPromises();
    const lastCall = vi.mocked(compendiumApi.searchCompendium).mock.calls.at(-1)?.[0];
    expect(lastCall).not.toHaveProperty('trait');

    vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
      feat('other-folk-feat', 'ancestry', ['someone-else']),
    ]);
    await slot?.get('.all input').setValue(false);
    await slot?.get('.all input').setValue(true);
    await flushPromises();
    await slot?.get('input[type="radio"]').setValue(true);
    expect(wrapper.emitted('pick')?.[0]?.[2]).toEqual({
      packId: 'feats',
      slug: 'other-folk-feat',
    });

    // The parent applies the pick; the slot then says it is off the list.
    await wrapper.setProps({
      build: build([
        {
          slot: 'ancestry',
          level: 1,
          feat: { packId: 'feats', slug: 'other-folk-feat' },
        },
      ]),
    });
    expect(wrapper.get('.warning').text()).toContain('is not a Invented Folk feat');
  });

  it('asks for an ancestry and class first, and lists every feat of the kind until then', async () => {
    const wrapper = await mountStep({ ancestry: undefined, classEntry: undefined });
    expect(wrapper.text()).toContain('Pick your ancestry and class first');
    const calls = vi.mocked(compendiumApi.searchCompendium).mock.calls.map((c) => c[0]);
    expect(calls.every((c) => c !== undefined && !('trait' in c))).toBe(true);
  });
});
