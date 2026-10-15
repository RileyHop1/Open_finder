// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import type { CharacterData, CharacterItem, SpellcastingEntry } from '@hearthtable/pf2e';
import { newCharacterData } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SpellsPanel from './SpellsPanel.vue';

vi.mock('../../api/compendium.js');

const NOW = '2026-10-15T00:00:00.000Z';
const ENTRY_ID = crypto.randomUUID();

function spell(name: string, rank: number, traits: string[] = []): CharacterItem {
  return {
    id: crypto.randomUUID(),
    equipped: false,
    quantity: 1,
    entry: {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      packId: 'spells',
      slug: name.toLowerCase().replaceAll(' ', '-'),
      name,
      kind: 'spell',
      traits,
      ruleElements: [],
      description: '',
      provenance: {
        publication: 'Pathfinder Player Core',
        license: 'ORC',
        remaster: true,
      },
      traditions: ['divine'],
      castTime: '2',
      range: { kind: 'touch' },
      sustained: false,
      rank,
    },
  } as unknown as CharacterItem;
}

function actorWith(data: Partial<CharacterData>): Actor {
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name: 'Sister Ilsa',
    system: { ...newCharacterData(), ...data },
  };
}

const heal = spell('Heal', 1);
const bless = spell('Bless', 1);
const shield = spell('Shield', 1, ['cantrip']);

/** Level 1, Wis +3, trained: spell attack +6 (3 + 1 + 2), spell DC 16. */
function prepared(over: Partial<SpellcastingEntry> = {}): SpellcastingEntry {
  return {
    id: ENTRY_ID,
    name: 'Cleric spellcasting',
    kind: 'prepared',
    tradition: 'divine',
    attribute: 'wis',
    rank: 'trained',
    cantrips: [shield.id],
    slots: { '1': 2 },
    prepared: [
      { rank: 1, itemId: heal.id, expended: true },
      { rank: 1, itemId: bless.id, expended: false },
    ],
    ...over,
  } as SpellcastingEntry;
}

function cleric(entries: SpellcastingEntry[] = [prepared()]): Actor {
  const base = newCharacterData();
  return actorWith({
    attributes: { ...base.attributes, wis: 3 },
    items: [heal, bless, shield],
    spellcasting: entries,
  });
}

function mountPanel(actor: Actor, editable = true) {
  return mount(SpellsPanel, { props: { actor, editable, rollable: editable } });
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('SpellsPanel', () => {
  it('renders nothing for a character who casts nothing', () => {
    const wrapper = mountPanel(actorWith({}));
    expect(wrapper.find('section').exists()).toBe(false);
  });

  it('says how many slots are left in words, not only pips', () => {
    const wrapper = mountPanel(cleric());
    expect(wrapper.find('[aria-label="Spell slots"]').text()).toContain('Rank 1');
    expect(wrapper.find('[aria-label="Spell slots"]').text()).toContain('1 of 2 left');
    expect(wrapper.find('.pips').attributes('aria-hidden')).toBe('true');
  });

  it('marks a cast prepared spell and offers to cast it again', () => {
    const wrapper = mountPanel(cleric());
    expect(wrapper.text()).toContain('Heal');
    expect(wrapper.text()).toContain('(cast)');
    expect(wrapper.find('button[aria-label="Cast again Heal"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Cast Bless"]').exists()).toBe(true);
  });

  it('shows the spell attack and DC from the character', () => {
    const wrapper = mountPanel(cleric());
    expect(
      wrapper
        .find('button[aria-label="Cleric spellcasting spell attack: show breakdown"]')
        .text(),
    ).toBe('+6');
    expect(
      wrapper
        .find('button[aria-label="Cleric spellcasting spell DC: show breakdown"]')
        .text(),
    ).toBe('16');
  });

  it('emits a cast from the entry at the spell’s slot rank', async () => {
    const wrapper = mountPanel(cleric());
    await wrapper.find('button[aria-label="Cast Bless"]').trigger('click');
    expect(wrapper.emitted('cast')).toEqual([
      [{ itemId: bless.id, entryId: ENTRY_ID, rank: 1 }],
    ]);
  });

  it('casts a cantrip with no rank and no focus', async () => {
    const wrapper = mountPanel(cleric());
    await wrapper.find('button[aria-label="Cast Shield"]').trigger('click');
    expect(wrapper.emitted('cast')).toEqual([[{ itemId: shield.id, entryId: ENTRY_ID }]]);
  });

  it('never disables a cast for having nothing left', async () => {
    const empty = cleric([
      prepared({
        slots: { '1': 1 },
        prepared: [{ rank: 1, itemId: heal.id, expended: true }],
      }),
    ]);
    const wrapper = mountPanel(empty);
    const button = wrapper.find('button[aria-label="Cast again Heal"]');
    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click');
    expect(wrapper.emitted('cast')).toHaveLength(1);
  });

  it('reads a spontaneous rank cast past its maximum as negative, in words', () => {
    const wrapper = mountPanel(
      actorWith({
        spellcasting: [
          {
            id: ENTRY_ID,
            name: 'Bard spellcasting',
            kind: 'spontaneous',
            tradition: 'occult',
            attribute: 'cha',
            rank: 'trained',
            cantrips: [],
            slots: { '1': { max: 2, used: 3 } },
            repertoire: [],
            signature: [],
          },
        ],
      }),
    );
    expect(wrapper.find('[aria-label="Spell slots"]').text()).toContain(
      '-1 (1 over the maximum)',
    );
  });

  it('casts a spontaneous spell at the rank chosen for it', async () => {
    const fear = spell('Fear', 1);
    const wrapper = mountPanel(
      actorWith({
        items: [fear],
        spellcasting: [
          {
            id: ENTRY_ID,
            name: 'Bard spellcasting',
            kind: 'spontaneous',
            tradition: 'occult',
            attribute: 'cha',
            rank: 'trained',
            cantrips: [],
            slots: { '1': { max: 3, used: 0 }, '2': { max: 2, used: 0 } },
            repertoire: [fear.id],
            signature: [],
          },
        ],
      }),
    );
    await wrapper.find('select').setValue('2');
    await wrapper.find('button[aria-label="Cast Fear"]').trigger('click');
    expect(wrapper.emitted('cast')).toEqual([
      [{ itemId: fear.id, entryId: ENTRY_ID, rank: 2 }],
    ]);
  });

  it('casts a focus spell by spending a focus point, and refocuses', async () => {
    const lay = spell('Lay on Hands', 1, ['focus']);
    const wrapper = mountPanel(
      actorWith({ items: [lay], focusPoints: { max: 1, current: 1 } }),
    );
    expect(wrapper.text()).toContain('1 of 1');
    await wrapper
      .find('button[aria-label="Cast Lay on Hands as a focus spell"]')
      .trigger('click');
    expect(wrapper.emitted('cast')).toEqual([[{ itemId: lay.id, focus: true }]]);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Refocus')
      ?.trigger('click');
    expect(wrapper.emitted('refocus')).toHaveLength(1);
  });

  it('rests, and rolls the spell attack', async () => {
    const wrapper = mountPanel(cleric());
    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('Rest'))
      ?.trigger('click');
    expect(wrapper.emitted('rest')).toHaveLength(1);
    await wrapper
      .find('button[aria-label^="Roll Cleric spellcasting spell attack"]')
      .trigger('click');
    expect(wrapper.emitted('roll')).toEqual([[`spellAttack:${ENTRY_ID}`]]);
  });

  it('is read-only for someone who cannot edit the character', () => {
    const wrapper = mountPanel(cleric(), false);
    expect(wrapper.text()).toContain('Bless');
    expect(wrapper.find('button[aria-label="Cast Bless"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Rest');
    expect(wrapper.find('button[aria-label^="Roll"]').exists()).toBe(false);
  });

  it('notes spells it can no longer find', () => {
    const wrapper = mountPanel(
      cleric([
        prepared({
          prepared: [{ rank: 1, itemId: crypto.randomUUID(), expended: false }],
        }),
      ]),
    );
    expect(wrapper.text()).toContain(
      '1 spell listed here is no longer on this character',
    );
  });
});
