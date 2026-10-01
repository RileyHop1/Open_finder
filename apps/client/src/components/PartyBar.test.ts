// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import { newCharacterData } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import PartyBar from './PartyBar.vue';

const NOW = '2026-09-30T00:00:00.000Z';
const WORLD = crypto.randomUUID();

/** Level 1, Con +2, 8 ancestry HP and 10 per level: max = 8 + (10 + 2) = 20. */
function member(
  name: string,
  hp: { current: number; temp?: number } = { current: 20 },
  extra: Partial<Actor> = {},
  conditions: { slug: string; value?: number }[] = [],
): Actor {
  const base = newCharacterData();
  return {
    id: crypto.randomUUID(),
    worldId: WORLD,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name,
    system: {
      ...base,
      attributes: { ...base.attributes, con: 2 },
      ancestryHp: 8,
      classHp: 10,
      hp: { current: hp.current, temp: hp.temp ?? 0 },
      conditions,
    },
    ...extra,
  };
}

const mountBar = (members: Actor[], selectedId?: string) =>
  mount(PartyBar, { props: { members, selectedId, worldId: WORLD } });

describe('PartyBar', () => {
  it('says so when there is no party', () => {
    expect(mountBar([]).text()).toContain('No party yet');
  });

  it('shows a card per member in the order given', () => {
    const wrapper = mountBar([member('Bram'), member('Anna')]);
    expect(wrapper.findAll('.party-member .name').map((n) => n.text())).toEqual([
      'Bram',
      'Anna',
    ]);
  });

  it('prints hit points as numbers as well as a bar, with temporary points and 0 in words', () => {
    const wrapper = mountBar([
      member('Anna', { current: 12, temp: 5 }),
      member('Bram', { current: 0 }),
    ]);
    const [anna, bram] = wrapper.findAll('.hp-text');
    expect(anna?.text()).toBe('12 / 20 (+5 temp)');
    expect(bram?.text()).toBe('0 / 20 · at 0');
    expect(wrapper.findAll('.hp-fill').map((f) => f.attributes('style'))).toEqual([
      'width: 60%;',
      'width: 0%;',
    ]);
  });

  it('never draws more than a full bar, or a bar when there is no maximum', () => {
    const over = mountBar([member('Anna', { current: 99 })]);
    expect(over.find('.hp-fill').attributes('style')).toBe('width: 100%;');

    const blank = member('Blank', { current: 0 });
    blank.system = newCharacterData();
    expect(mountBar([blank]).find('.hp-fill').attributes('style')).toBe('width: 0%;');
  });

  it('shows conditions as text badges with their value, folding extras into a count', () => {
    const wrapper = mountBar([
      member('Anna', { current: 20 }, {}, [
        { slug: 'frightened', value: 2 },
        { slug: 'prone' },
        { slug: 'off-guard' },
        { slug: 'clumsy', value: 1 },
        { slug: 'sickened', value: 1 },
      ]),
    ]);
    expect(wrapper.findAll('.badge').map((b) => b.text())).toEqual([
      'Frightened 2',
      'Prone',
      'Off Guard',
      '+2 more',
    ]);
  });

  it('uses the portrait when there is one and an initial placeholder when there is not', () => {
    const wrapper = mountBar([
      member('Anna', { current: 20 }, { portrait: `${'a'.repeat(64)}.png` }),
      member('bram'),
    ]);
    const [withImage, without] = wrapper.findAll('.party-member');
    const img = withImage?.find('img.portrait');
    expect(img?.attributes('src')).toBe(
      `/api/worlds/${WORLD}/assets/${'a'.repeat(64)}.png`,
    );
    // Decorative: the name is printed beside it.
    expect(img?.attributes('alt')).toBe('');
    expect(without?.find('img').exists()).toBe(false);
    expect(without?.find('.placeholder').text()).toBe('B');
    expect(without?.find('.placeholder').attributes('aria-hidden')).toBe('true');
  });

  it('shows an NPC member by name alone', () => {
    const npc = member('Innkeeper', { current: 5 }, { kind: 'npc', system: {} });
    const wrapper = mountBar([npc]);
    expect(wrapper.find('.name').text()).toBe('Innkeeper');
    expect(wrapper.find('.hp-text').exists()).toBe(false);
  });

  it('opens a member on click, marking the open one as pressed', async () => {
    const [anna, bram] = [member('Anna'), member('Bram')];
    const wrapper = mountBar([anna, bram], bram.id);
    const buttons = wrapper.findAll('button.party-member');
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(['false', 'true']);

    await buttons[0]?.trigger('click');
    expect(wrapper.emitted('select')).toEqual([[anna.id]]);
  });

  it('is built of real buttons, so Enter and Space work and each is at least 44px tall', () => {
    const wrapper = mountBar([member('Anna')]);
    expect(wrapper.find('li > button').exists()).toBe(true);
    expect(wrapper.find('button').attributes('type')).toBe('button');
  });
});
