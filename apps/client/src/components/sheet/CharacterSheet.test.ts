// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import type { CharacterData } from '@hearthtable/pf2e';
import { newCharacterData } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import CharacterSheet from './CharacterSheet.vue';
import { signed, titleCase } from './format.js';

const NOW = '2026-09-30T00:00:00.000Z';

function makeActor(
  system: Record<string, unknown>,
  overrides: Partial<Pick<Actor, 'kind' | 'name'>> = {},
): Actor {
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
    system,
    ...overrides,
  };
}

/** A level 3 character with hand-computed numbers (see each test). */
function level3(): CharacterData {
  const data = newCharacterData();
  return {
    ...data,
    level: 3,
    attributes: { str: 4, dex: 1, con: 2, int: 0, wis: 1, cha: -1 },
    keyAttribute: 'str',
    ancestry: { name: 'Invented Folk' },
    class: { name: 'Invented Class' },
    ancestryHp: 8,
    classHp: 10,
    hp: { current: 30, temp: 5 },
    ranks: {
      ...data.ranks,
      fortitude: 'trained',
      classDc: 'trained',
      skills: { athletics: 'trained', 'academia-lore': 'expert' },
    },
  };
}

const rowFor = (wrapper: ReturnType<typeof mount>, label: string) =>
  wrapper.findAll('tbody tr').find((row) => row.find('th').text() === label);

describe('format', () => {
  it('shows a bonus with its sign, using a real minus', () => {
    expect(signed(3)).toBe('+3');
    expect(signed(0)).toBe('+0');
    expect(signed(-2)).toBe('−2');
  });

  it('turns a slug into a name', () => {
    expect(titleCase('academia-lore')).toBe('Academia Lore');
    expect(titleCase('skill:athletics')).toBe('Athletics');
  });
});

describe('CharacterSheet', () => {
  it('shows the header: name, level, lineage, and hit points against the derived maximum', () => {
    const wrapper = mount(CharacterSheet, { props: { actor: makeActor(level3()) } });
    expect(wrapper.find('h3').text()).toBe('Valeria');
    expect(wrapper.find('.level').text()).toBe('Level 3');
    expect(wrapper.find('.lineage').text()).toBe('Invented Folk · Invented Class');
    // Max HP: 8 + (10 + 2) * 3 = 44.
    expect(wrapper.find('.hit-points').text()).toContain('30 / 44');
    expect(wrapper.find('.hit-points').text()).toContain('+5 temporary');
  });

  it('shows each attribute modifier with its sign', () => {
    const wrapper = mount(CharacterSheet, { props: { actor: makeActor(level3()) } });
    const items = wrapper.findAll('.attributes li').map((li) => li.text());
    expect(items).toEqual([
      'Strength+4',
      'Dexterity+1',
      'Constitution+2',
      'Intelligence+0',
      'Wisdom+1',
      'Charisma−1',
    ]);
  });

  it('shows defenses from the rules engine, with ranks in words', () => {
    const wrapper = mount(CharacterSheet, { props: { actor: makeActor(level3()) } });
    const text = (label: string) => rowFor(wrapper, label)?.text();
    // AC 10 + Dex 1 (untrained armor adds nothing).
    expect(text('Armor Class')).toContain('11');
    // Fortitude: Con 2 + trained (2 + level 3).
    expect(text('Fortitude')).toContain('Trained');
    expect(rowFor(wrapper, 'Fortitude')?.find('.total').text()).toBe('+7');
    expect(rowFor(wrapper, 'Reflex')?.find('.total').text()).toBe('+1');
    // Class DC 10 + Str 4 + trained 5: a DC is not signed.
    expect(rowFor(wrapper, 'Class DC')?.find('.total').text()).toBe('19');
  });

  it('lists skills alphabetically, including Lore skills, with their ranks and bonuses', () => {
    const wrapper = mount(CharacterSheet, { props: { actor: makeActor(level3()) } });
    const skills = wrapper.findAll('section[aria-labelledby="skills-heading"] tbody tr');
    const labels = skills.map((row) => row.find('th').text());
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(labels).toContain('Academia Lore');

    // Athletics: Str 4 + trained 5.
    expect(rowFor(wrapper, 'Athletics')?.find('.total').text()).toBe('+9');
    expect(rowFor(wrapper, 'Athletics')?.find('.rank').text()).toBe('Trained');
    // Lore uses Intelligence 0 + expert (4 + level 3).
    expect(rowFor(wrapper, 'Academia Lore')?.find('.total').text()).toBe('+7');
    // An untrained skill still shows its attribute, and says so.
    expect(rowFor(wrapper, 'Acrobatics')?.find('.rank').text()).toBe('Untrained');
  });

  it('shows conditions by name and value, and the numbers they change', () => {
    const data = { ...level3(), conditions: [{ slug: 'frightened', value: 2 }] };
    const wrapper = mount(CharacterSheet, { props: { actor: makeActor(data) } });
    expect(wrapper.find('.conditions').text()).toContain('Frightened 2');
    // Frightened 2 is -2 to every check: Fortitude +7 -> +5.
    expect(rowFor(wrapper, 'Fortitude')?.find('.total').text()).toBe('+5');
  });

  it('follows the actor when it changes', async () => {
    const wrapper = mount(CharacterSheet, { props: { actor: makeActor(level3()) } });
    const next = { ...level3(), attributes: { ...level3().attributes, str: 5 } };
    await wrapper.setProps({ actor: makeActor(next) });
    expect(rowFor(wrapper, 'Athletics')?.find('.total').text()).toBe('+10');
  });

  it('explains instead of crashing for an NPC or for data that no longer validates', () => {
    const npc = mount(CharacterSheet, {
      props: { actor: makeActor({}, { kind: 'npc', name: 'Innkeeper' }) },
    });
    expect(npc.text()).toContain('A npc does not have a character sheet yet');

    const broken = mount(CharacterSheet, {
      props: { actor: makeActor({ level: 'high' }) },
    });
    expect(broken.text()).toContain('stored data is not valid');
  });
});

describe('sheet budget (CLAUDE.md: opens in under 200ms)', () => {
  it('prepares and renders a level 20 character with a full inventory well inside it', () => {
    const base = newCharacterData();
    const provenance = {
      publication: 'Pathfinder Player Core',
      license: 'ORC' as const,
      remaster: true as const,
    };
    const items = Array.from({ length: 80 }, (_, index) => ({
      id: crypto.randomUUID(),
      equipped: index % 2 === 0,
      quantity: 1,
      entry: {
        id: crypto.randomUUID(),
        schemaVersion: 1,
        createdAt: NOW,
        updatedAt: NOW,
        packId: 'equipment',
        slug: `invented-gear-${index}`,
        name: `Invented Gear ${index}`,
        kind: 'gear' as const,
        provenance,
        traits: [],
        ruleElements: [],
        description: '',
      },
    }));
    const lores = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`invented-lore-${i}`, 'legendary' as const]),
    );
    const data: CharacterData = {
      ...base,
      level: 20,
      items,
      ranks: { ...base.ranks, skills: lores },
      conditions: [
        { slug: 'frightened', value: 2 },
        { slug: 'clumsy', value: 1 },
      ],
    };
    const actor = makeActor(data);

    mount(CharacterSheet, { props: { actor } }).unmount(); // warm-up: module and JIT cost is not a sheet opening
    const started = performance.now();
    mount(CharacterSheet, { props: { actor } });
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(200);
  });
});
