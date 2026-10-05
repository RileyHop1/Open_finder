// @vitest-environment jsdom
import type { Statistic } from '@hearthtable/core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ModifierList from './ModifierList.vue';

function makeStatistic(overrides: Partial<Statistic> = {}): Statistic {
  return { total: 0, modifiers: [], ...overrides };
}

describe('ModifierList', () => {
  it('shows the total, defaulting the heading to "Bonus"', () => {
    const wrapper = mount(ModifierList, {
      props: { statistic: makeStatistic({ total: 7 }) },
    });
    expect(wrapper.find('.modifiers-heading').text()).toBe('Bonus +7');
  });

  it('accepts a different heading, for a damage modifier', () => {
    const wrapper = mount(ModifierList, {
      props: { statistic: makeStatistic({ total: -2 }), heading: 'Damage modifier' },
    });
    expect(wrapper.find('.modifiers-heading').text()).toBe('Damage modifier −2');
  });

  it('lists every modifier with its value, label, and type', () => {
    const wrapper = mount(ModifierList, {
      props: {
        statistic: makeStatistic({
          total: 3,
          modifiers: [
            {
              slug: 'str',
              label: 'Strength',
              type: 'ability',
              value: 3,
              source: 'attribute',
              enabled: true,
              applied: true,
            },
          ],
        }),
      },
    });
    const item = wrapper.find('.modifiers li');
    expect(item.text()).toContain('+3 Strength');
    expect(item.text()).toContain('(ability)');
    expect(item.classes()).not.toContain('unapplied');
  });

  it('strikes through a suppressed modifier and explains why, naming the winner', () => {
    const wrapper = mount(ModifierList, {
      props: {
        statistic: makeStatistic({
          total: 2,
          modifiers: [
            {
              slug: 'clumsy',
              label: 'Clumsy',
              type: 'status',
              value: -1,
              source: 'condition',
              enabled: true,
              applied: false,
              suppressedBy: 'frightened',
            },
          ],
        }),
      },
    });
    const item = wrapper.find('.modifiers li');
    expect(item.classes()).toContain('unapplied');
    expect(item.text()).toContain('not applied: Frightened is better');
  });

  it('says a disabled or predicate-failed modifier is "not applied", with no winner named', () => {
    const wrapper = mount(ModifierList, {
      props: {
        statistic: makeStatistic({
          total: 0,
          modifiers: [
            {
              slug: 'bless',
              label: 'Bless',
              type: 'status',
              value: 1,
              source: 'spell',
              enabled: false,
              applied: false,
            },
          ],
        }),
      },
    });
    const item = wrapper.find('.modifiers li');
    expect(item.text()).toContain('not applied');
    expect(item.text()).not.toContain('is better');
  });

  it('renders nothing in the list for an empty modifier set', () => {
    const wrapper = mount(ModifierList, { props: { statistic: makeStatistic() } });
    expect(wrapper.findAll('.modifiers li')).toHaveLength(0);
  });
});
