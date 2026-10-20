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
    expect(wrapper.text()).toContain('Advanced alchemy');
    expect(wrapper.get('.crafting strong').text()).toBe('6');
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
      .get('button[aria-label="Refill your versatile vials (daily preparations)"]')
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
});
