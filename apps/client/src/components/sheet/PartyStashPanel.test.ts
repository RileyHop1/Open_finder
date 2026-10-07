// @vitest-environment jsdom
import { partyStashSchema } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import PartyStashPanel from './PartyStashPanel.vue';

const rope = {
  id: crypto.randomUUID(),
  quantity: 3,
  entry: {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    packId: 'equipment',
    slug: 'invented-rope',
    name: 'Invented Rope',
    kind: 'gear' as const,
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
  },
};

const stash = (coins: Record<string, number> = {}, items: unknown[] = [rope]) =>
  partyStashSchema.parse({ coins, items });

const members = [
  { id: 'ada', name: 'Ada' },
  { id: 'bo', name: 'Bo' },
];

const mountPanel = (isGm: boolean, s = stash({ gp: 4 })) =>
  mount(PartyStashPanel, { props: { stash: s, isGm, recipients: members } });

describe('PartyStashPanel', () => {
  it('shows the purse and items to everyone, with no controls for a player', () => {
    const wrapper = mountPanel(false);
    expect(wrapper.get('.purse').text()).toContain('4');
    expect(wrapper.text()).toContain('Invented Rope');
    expect(wrapper.text()).toContain('×3');
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.text()).toContain('Use Give…');
  });

  it('says so when the stash holds no items', () => {
    expect(mountPanel(true, stash({}, [])).text()).toContain('No items.');
  });

  it('lets the GM give part of a stack to a member', async () => {
    const wrapper = mountPanel(true);
    await wrapper.get('button[aria-label="Give Invented Rope"]').trigger('click');
    await wrapper.get('.give select').setValue('bo');
    await wrapper.get('.give input[aria-label="How many to give"]').setValue('2');
    await wrapper.get('form[aria-label="Give Invented Rope"]').trigger('submit');
    expect(wrapper.emitted('take')).toEqual([[rope.id, 'bo', 2]]);
  });

  it('lets the GM give coins to a member', async () => {
    const wrapper = mountPanel(true);
    await wrapper.findAll('.coin-actions button')[0]?.trigger('click');
    await wrapper.get('input[aria-label="gp to give"]').setValue('1');
    await wrapper.get('form[aria-label="Give stash coins"]').trigger('submit');
    expect(wrapper.emitted('takeCoins')).toEqual([['ada', { gp: 1 }]]);
  });

  it('splits the coins evenly among the members, saying what each gets', async () => {
    const wrapper = mountPanel(true);
    const split = wrapper.findAll('.coin-actions button')[1];
    expect(split?.attributes('title')).toBe('Each of 2 gets 2 gp');
    await split?.trigger('click');
    expect(wrapper.emitted('split')).toEqual([[{ pp: 0, gp: 2, sp: 0, cp: 0 }]]);
  });

  it('turns Split evenly off when there is nothing to split', () => {
    const wrapper = mountPanel(true, stash({}));
    expect(
      wrapper.findAll('.coin-actions button')[1]?.attributes('disabled'),
    ).toBeDefined();
  });
});
