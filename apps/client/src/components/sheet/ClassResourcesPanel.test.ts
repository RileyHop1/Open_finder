// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import type { CharacterData } from '@hearthtable/pf2e';
import { newCharacterData } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ClassResourcesPanel from './ClassResourcesPanel.vue';

const NOW = '2026-10-20T00:00:00.000Z';

/** An invented Alchemist with Int +2: 4 versatile vials, 6 Advanced Alchemy items. */
function alchemist(over: Partial<CharacterData> = {}, classSlug = 'alchemist'): Actor {
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
    name: 'Fizz',
    system: {
      ...base,
      attributes: { ...base.attributes, int: 2 },
      class: { name: classSlug, source: { packId: 'classes', slug: classSlug } },
      ...over,
    },
  };
}

const mountPanel = (actor: Actor, editable = true) =>
  mount(ClassResourcesPanel, { props: { actor, editable } });

describe('ClassResourcesPanel', () => {
  it('counts an Alchemist’s versatile vials in words, and its Advanced Alchemy', () => {
    const wrapper = mountPanel(alchemist());
    const vials = wrapper.get('[aria-label="Versatile vials"]');
    expect(vials.text()).toContain('4 of 4 left');
    expect(vials.find('.pips').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('.crafting').text()).toContain(
      'Advanced alchemy: 0 of 6 infused items made today',
    );
  });

  it('uses, regains and refills vials with one click each', async () => {
    const wrapper = mountPanel(
      alchemist({ resources: { 'versatile-vials': { used: 1 } } }),
    );
    await wrapper
      .get('button[aria-label="Use one of your versatile vials"]')
      .trigger('click');
    await wrapper.get('button[aria-label="Regain 2 versatile vials"]').trigger('click');
    await wrapper
      .get('button[aria-label="Refill your versatile vials"]')
      .trigger('click');
    expect(wrapper.emitted('change')).toEqual([
      [{ 'system.resources.versatile-vials.used': 2 }],
      [{ 'system.resources.versatile-vials.used': 0 }],
      [{ 'system.resources.versatile-vials.used': 0 }],
    ]);
  });

  it('never disables using one past the last, and reads it as over the maximum', () => {
    const wrapper = mountPanel(
      alchemist({ resources: { 'versatile-vials': { used: 5 } } }),
    );
    expect(wrapper.text()).toContain('-1 (1 over the maximum)');
    const use = wrapper.get('button[aria-label="Use one of your versatile vials"]');
    expect(use.attributes('disabled')).toBeUndefined();
  });

  it('sets the maximum by hand, and clears it back to 2 + Int', async () => {
    const wrapper = mountPanel(alchemist());
    const max = wrapper.get('.max input');
    expect(max.attributes('placeholder')).toBe('4');
    await max.setValue('6');
    await max.setValue('');
    expect(wrapper.emitted('change')).toEqual([
      [{ 'system.resources.versatile-vials.max': 6 }],
      [{ 'system.resources.versatile-vials.max': null }],
    ]);
  });

  it('is read-only for someone who cannot edit, and empty for a class with no resources', () => {
    expect(mountPanel(alchemist(), false).find('button').exists()).toBe(false);
    expect(mountPanel(alchemist({}, 'fighter')).find('section').exists()).toBe(false);
  });

  it('counts the infused items Advanced Alchemy made today, in words past the count', () => {
    const base = newCharacterData();
    const made = (quantity: number, infused: 'daily' | 'quick') => ({
      id: crypto.randomUUID(),
      equipped: false,
      quantity,
      infused,
      entry: {
        id: crypto.randomUUID(),
        schemaVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
        packId: 'equipment',
        slug: 'invented-tonic',
        name: 'Invented Tonic',
        kind: 'gear',
        provenance: {
          publication: 'Pathfinder Player Core 2',
          license: 'ORC',
          remaster: true,
        },
        traits: ['alchemical', 'consumable'],
        ruleElements: [],
        description: '',
      },
    });
    const wrapper = mountPanel(
      alchemist({
        items: [...base.items, made(5, 'daily'), made(2, 'daily'), made(1, 'quick')],
      } as Partial<CharacterData>),
    );
    expect(wrapper.get('.crafting').text()).toContain(
      '7 of 6 infused items made today (1 more than you make each day)',
    );
  });

  it('sends daily preparations from one button', async () => {
    const wrapper = mountPanel(alchemist());
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Daily preparations')
      ?.trigger('click');
    expect(wrapper.emitted('prepare')).toHaveLength(1);
    expect(mountPanel(alchemist(), false).text()).not.toContain('Daily preparations');
  });
});
