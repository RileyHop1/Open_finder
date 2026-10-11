// @vitest-environment jsdom
import type { AncestryEntry, BackgroundEntry, ClassEntry } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AttributesStep from './AttributesStep.vue';

// Everything below is invented (ADR 0013).
const ancestry = {
  name: 'Invented Folk',
  boosts: ['str', 'con'],
  freeBoosts: 1,
  flaws: [],
} as unknown as AncestryEntry;
const background = {
  name: 'Invented Trade',
  boostOptions: ['str', 'dex'],
} as unknown as BackgroundEntry;
const cls = {
  name: 'Invented Vanguard',
  keyAttributeOptions: ['str', 'dex'],
} as unknown as ClassEntry;

const mountStep = (props: Record<string, unknown>) =>
  mount(AttributesStep, {
    props: { entries: {}, picks: {}, keyAttribute: undefined, ...props } as never,
  });

const modifiers = (wrapper: ReturnType<typeof mountStep>) =>
  Object.fromEntries(
    wrapper
      .findAll('.modifiers tr')
      .map((r) => [r.get('th').text(), r.get('strong').text()]),
  );

describe('AttributesStep', () => {
  it('lets the free boosts be placed before anything else is picked', () => {
    const wrapper = mountStep({});
    expect(wrapper.text()).toContain('Pick your ancestry and background');
    expect(wrapper.findAll('fieldset')).toHaveLength(1);
    expect(wrapper.findAll('.toggle')).toHaveLength(6);
    expect(modifiers(wrapper).Strength).toBe('+0');
  });

  it('shows the ancestry’s fixed boosts as already on, and the key attribute boost', () => {
    const wrapper = mountStep({ entries: { ancestry, background, class: cls } });
    expect(wrapper.findAll('.fixed').map((f) => f.text())).toEqual([
      'Strength (fixed)',
      'Constitution (fixed)',
    ]);
    expect(wrapper.get('.key-note').text()).toContain('Strength');
    // Ancestry str + con, class key str.
    expect(modifiers(wrapper)).toMatchObject({ Strength: '+2', Constitution: '+1' });
  });

  it('offers the background’s boost only its options, and emits the toggle', async () => {
    const wrapper = mountStep({ entries: { ancestry, background, class: cls } });
    const choice = wrapper
      .findAll('fieldset')
      .find((f) => f.get('legend').text().includes('Invented Trade boost'));
    expect(choice?.findAll('.toggle').map((b) => b.text())).toEqual([
      'Strength',
      'Dexterity',
    ]);
    await choice?.findAll('.toggle')[1]?.trigger('click');
    expect(wrapper.emitted('toggle')).toEqual([['background-choice', 'dex']]);
  });

  it('shows the modifiers live from the picks, and marks a pressed toggle', () => {
    const wrapper = mountStep({
      entries: { ancestry, background, class: cls },
      picks: { 'background-choice': ['dex'], free: ['dex', 'wis'] },
    });
    expect(modifiers(wrapper)).toMatchObject({
      Strength: '+2',
      Dexterity: '+2',
      Wisdom: '+1',
    });
    expect(wrapper.findAll('[aria-pressed="true"]').length).toBe(3);
  });

  it('says so when a section has too many, and still applies them (ADR 0023)', () => {
    const wrapper = mountStep({
      entries: { ancestry, background, class: cls },
      picks: { 'background-choice': ['str', 'dex'] },
    });
    expect(wrapper.text()).toContain('2 chosen but only 1 allowed');
    expect(modifiers(wrapper).Dexterity).toBe('+1');
  });

  it('flags a boost taken twice from one source', () => {
    const wrapper = mountStep({
      entries: { ancestry, background, class: cls },
      picks: { free: ['str', 'str'] },
    });
    expect(wrapper.text()).toContain('Strength is boosted twice from the same source');
  });
});
