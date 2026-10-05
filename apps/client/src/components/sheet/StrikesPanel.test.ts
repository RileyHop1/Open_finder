// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import type { CharacterData, WeaponEntry } from '@hearthtable/pf2e';
import { newCharacterData } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import StrikesPanel from './StrikesPanel.vue';

const NOW = '2026-09-30T00:00:00.000Z';

function sword(traits: string[] = []): WeaponEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'equipment',
    slug: 'invented-sword',
    name: 'Invented Sword',
    kind: 'weapon' as const,
    provenance: {
      publication: 'Pathfinder Player Core',
      license: 'ORC' as const,
      remaster: true as const,
    },
    traits,
    ruleElements: [],
    description: '',
    category: 'martial' as const,
    group: 'sword',
    damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
    hands: 1,
  };
}

/** Level 1, Str +4, martial trained: +7 to hit, damage 1d8+4. */
function fighter(equipped: boolean, traits: string[] = []): Actor {
  const base = newCharacterData();
  const data: CharacterData = {
    ...base,
    attributes: { ...base.attributes, str: 4 },
    ranks: { ...base.ranks, weapons: { ...base.ranks.weapons, martial: 'trained' } },
    items: [{ id: crypto.randomUUID(), entry: sword(traits), equipped, quantity: 1 }],
  };
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name: 'Valeria',
    system: data,
  };
}

describe('StrikesPanel', () => {
  it('says so, including that unarmed is not modeled, when no weapon is equipped', () => {
    const wrapper = mount(StrikesPanel, { props: { actor: fighter(false) } });
    expect(wrapper.find('.empty').text()).toContain('No equipped weapon');
    expect(wrapper.find('.empty').text()).toContain('Unarmed strikes are not modeled');
  });

  it('shows the three attack bonuses, penalty included, and what damage rolls', () => {
    const wrapper = mount(StrikesPanel, { props: { actor: fighter(true) } });
    expect(wrapper.find('.strike-name').text()).toBe('Invented Sword');
    expect(wrapper.findAll('.attacks li').map((li) => li.text())).toEqual([
      '1st +7',
      '2nd +2',
      '3rd −3',
    ]);
    expect(wrapper.find('.damage-line').text()).toContain('1d8+4 slashing');
  });

  it('shows the extra critical die for a deadly weapon before it is rolled', () => {
    const wrapper = mount(StrikesPanel, {
      props: { actor: fighter(true, ['deadly-d10']) },
    });
    expect(wrapper.find('.damage-line').text()).toContain('1d8+4 slashing');
    expect(wrapper.find('.crit').text()).toContain('1d10 slashing');
  });

  it('is read-only without rollable: numbers, no Roll buttons', () => {
    const wrapper = mount(StrikesPanel, { props: { actor: fighter(true) } });
    // Each attack's own breakdown trigger is still a button -- just not a Roll one.
    expect(wrapper.find('button[aria-label^="Roll "]').exists()).toBe(false);
  });

  it('opens an attack’s own breakdown, separately from rolling it', async () => {
    const wrapper = mount(StrikesPanel, {
      props: { actor: fighter(true), rollable: true },
    });
    const [first] = wrapper.findAll('.attacks li');
    await first?.find('.stat-trigger').trigger('click');

    const popover = wrapper.get('.stat-popover');
    expect(popover.get('h4').text()).toBe('Invented Sword 1st attack');
    expect(popover.text()).toContain('Bonus +7');
    expect(wrapper.emitted('attack')).toBeUndefined();
  });

  it('emits which attack of the turn was pressed, and normal or critical damage', async () => {
    const actor = fighter(true);
    const wrapper = mount(StrikesPanel, { props: { actor, rollable: true } });
    const itemId = (actor.system as CharacterData).items[0]?.id;

    await wrapper
      .find('button[aria-label="Roll Invented Sword 2nd attack, +2"]')
      .trigger('click');
    await wrapper
      .find('button[aria-label="Roll Invented Sword 3rd attack, −3"]')
      .trigger('click');
    expect(wrapper.emitted('attack')).toEqual([
      [itemId, 2],
      [itemId, 3],
    ]);

    await wrapper
      .find('button[aria-label="Roll Invented Sword damage"]')
      .trigger('click');
    await wrapper
      .find('button[aria-label="Roll Invented Sword critical damage"]')
      .trigger('click');
    expect(wrapper.emitted('damage')).toEqual([
      [itemId, false],
      [itemId, true],
    ]);
  });
});
