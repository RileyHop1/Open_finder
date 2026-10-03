// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import { newCharacterData } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import HitPointsPanel from './HitPointsPanel.vue';

const NOW = '2026-09-30T00:00:00.000Z';

/** Level 1, Con +2, 8 ancestry HP and 10 per level: max = 8 + (10 + 2) = 20. */
function actorWithHp(current: number, temp: number): Actor {
  const base = newCharacterData();
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name: 'Hero',
    system: {
      ...base,
      attributes: { ...base.attributes, con: 2 },
      ancestryHp: 8,
      classHp: 10,
      hp: { current, temp },
    },
  };
}

function mountPanel(current: number, temp: number, editable = true) {
  return mount(HitPointsPanel, {
    props: { actor: actorWithHp(current, temp), editable },
  });
}

describe('reading', () => {
  it('shows current over derived maximum, temporary points, and being at 0 in words', () => {
    expect(mountPanel(12, 0).find('.hp-read').text()).toBe('12 / 20');
    expect(mountPanel(12, 5).find('.hp-read').text()).toContain('5 temporary');
    expect(mountPanel(0, 0).find('.hp-read').text()).toContain('at 0 hit points');
  });

  it('has no controls for someone who may not edit', () => {
    const wrapper = mountPanel(12, 0, false);
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
  });
});

describe('the buttons', () => {
  it('are disabled until there is a whole amount of at least 1', async () => {
    const wrapper = mountPanel(12, 0);
    const disabled = () => wrapper.findAll('button').map((b) => b.attributes('disabled'));
    expect(disabled().every((d) => d !== undefined)).toBe(true);
    await wrapper.find('#hp-amount').setValue('3');
    expect(disabled().every((d) => d === undefined)).toBe(true);
    await wrapper.find('#hp-amount').setValue('0');
    expect(disabled().every((d) => d !== undefined)).toBe(true);
  });

  it('sends damage as an amount, not a field change, so the server runs the dying chain', async () => {
    const wrapper = mountPanel(12, 5);
    await wrapper.find('#hp-amount').setValue('3');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('damage')).toEqual([[3, false]]);
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('carries whether it was a critical hit', async () => {
    const wrapper = mountPanel(12, 5);
    await wrapper.find('#hp-amount').setValue('3');
    await wrapper.find('#hp-critical').setValue(true);
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('damage')).toEqual([[3, true]]);
  });

  it('sends healing as an amount too, for the same reason', async () => {
    const wrapper = mountPanel(18, 0);
    await wrapper.find('#hp-amount').setValue('10');
    await wrapper.findAll('button')[1]?.trigger('click');
    expect(wrapper.emitted('heal')).toEqual([[10]]);
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('temp HP keeps the larger amount instead of adding', async () => {
    const lower = mountPanel(12, 8);
    await lower.find('#hp-amount').setValue('5');
    await lower.findAll('button')[2]?.trigger('click');
    expect(lower.emitted('change')).toBeUndefined();

    const higher = mountPanel(12, 5);
    await higher.find('#hp-amount').setValue('8');
    await higher.findAll('button')[2]?.trigger('click');
    expect(higher.emitted('change')).toEqual([[{ 'system.hp.temp': 8 }]]);
  });

  it('clears the amount after use', async () => {
    const wrapper = mountPanel(12, 0);
    await wrapper.find('#hp-amount').setValue('3');
    await wrapper.find('form').trigger('submit');
    expect((wrapper.find('#hp-amount').element as HTMLInputElement).value).toBe('');
  });
});
