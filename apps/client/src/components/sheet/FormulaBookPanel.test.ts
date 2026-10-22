// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import type { CharacterData } from '@hearthtable/pf2e';
import { newCharacterData } from '@hearthtable/pf2e';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../../api/compendium.js';
import FormulaBookPanel from './FormulaBookPanel.vue';

vi.mock('../../api/compendium.js');

const NOW = '2026-10-21T00:00:00.000Z';

// Invented items and an invented Alchemist (ADR 0013).
const flask = {
  source: { packId: 'equipment', slug: 'invented-flask' },
  name: 'Invented Flask',
  level: 1,
};
const tonic = {
  source: { packId: 'equipment', slug: 'invented-tonic' },
  name: 'Invented Tonic',
  level: 3,
};

function character(over: Partial<CharacterData> = {}, classSlug = 'alchemist'): Actor {
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
      ...newCharacterData(),
      class: { name: classSlug, source: { packId: 'classes', slug: classSlug } },
      ...over,
    },
  };
}

const summary = (slug: string, name: string, level: number) => ({
  packId: 'equipment',
  slug,
  name,
  kind: 'gear',
  traits: ['alchemical', 'consumable'],
  level,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
    summary('invented-flask', 'Invented Flask', 1),
    summary('invented-elixir', 'Invented Elixir', 1),
    summary('invented-bomb-greater', 'Invented Bomb (Greater)', 11),
  ]);
});

const mountPanel = (actor: Actor, editable = true) =>
  mount(FormulaBookPanel, { props: { actor, editable } });

describe('FormulaBookPanel', () => {
  it('lists the formulas by level and counts them against an Alchemist’s 8', () => {
    const wrapper = mountPanel(character({ formulas: [tonic, flask] }));
    expect(wrapper.findAll('li .name').map((n) => n.text())).toEqual([
      'Invented Flask',
      'Invented Tonic',
    ]);
    expect(wrapper.get('.count').text()).toContain('2 of 8 formulas');
  });

  it('searches alchemical items and adds one, kept whole', async () => {
    const wrapper = mountPanel(character({ formulas: [flask] }));
    await wrapper.get('input[type="search"]').setValue('invented');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(compendiumApi.searchCompendium).toHaveBeenCalledWith({
      q: 'invented',
      trait: 'alchemical',
      limit: 50,
    });
    expect(
      wrapper.get('button[aria-label="Add the formula for Invented Flask"]').text(),
    ).toBe('In your book');
    await wrapper
      .get('button[aria-label="Add the formula for Invented Elixir"]')
      .trigger('click');
    expect(wrapper.emitted('change')).toEqual([
      [
        {
          'system.formulas': [
            flask,
            {
              source: { packId: 'equipment', slug: 'invented-elixir' },
              name: 'Invented Elixir',
              level: 1,
            },
          ],
        },
      ],
    ]);
  });

  it('notes a formula above the character’s level, and still adds it', async () => {
    const wrapper = mountPanel(character());
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    const greater = wrapper
      .findAll('.results li')
      .find((li) => li.text().includes('Invented Bomb (Greater)'));
    expect(greater?.text()).toContain('above your level');
    await greater?.get('button').trigger('click');
    expect(wrapper.emitted('change')).toHaveLength(1);
  });

  it('removes a formula', async () => {
    const wrapper = mountPanel(character({ formulas: [flask, tonic] }));
    await wrapper
      .get('button[aria-label="Remove the formula for Invented Flask"]')
      .trigger('click');
    expect(wrapper.emitted('change')).toEqual([[{ 'system.formulas': [tonic] }]]);
  });

  it('counts past the start in words, and shows a book for anyone who has formulas', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      source: { packId: 'equipment', slug: `f${i}` },
      name: `F${i}`,
    }));
    expect(
      mountPanel(character({ formulas: many }))
        .get('.count')
        .text(),
    ).toContain('9 of 8 formulas (1 more than you start with)');
    const fighter = mountPanel(character({ formulas: [flask] }, 'fighter'));
    expect(fighter.text()).toContain('Invented Flask');
    expect(fighter.find('.count').exists()).toBe(false);
  });

  it('is read-only for someone who cannot edit, and absent for a class with no book and no formulas', () => {
    const readOnly = mountPanel(character({ formulas: [flask] }), false);
    expect(readOnly.find('button').exists()).toBe(false);
    expect(readOnly.find('form').exists()).toBe(false);
    expect(mountPanel(character({}, 'fighter')).find('section').exists()).toBe(false);
  });

  it('makes an item from a formula with Advanced or Quick Alchemy, for an Alchemist only', async () => {
    const wrapper = mountPanel(character({ formulas: [flask] }));
    await wrapper
      .get('button[aria-label="Make Invented Flask with Advanced Alchemy"]')
      .trigger('click');
    await wrapper
      .get('button[aria-label="Make Invented Flask with Quick Alchemy (spends a vial)"]')
      .trigger('click');
    expect(wrapper.emitted('make')).toEqual([
      [flask, false],
      [flask, true],
    ]);
    const fighter = mountPanel(character({ formulas: [flask] }, 'fighter'));
    expect(fighter.text()).not.toContain('Make');
    expect(mountPanel(character({ formulas: [flask] }), false).text()).not.toContain(
      'Quick',
    );
  });
});
