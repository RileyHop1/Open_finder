// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import { newCharacterData, type ConditionDuration } from '@hearthtable/pf2e';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../../api/compendium.js';
import ConditionsPanel from './ConditionsPanel.vue';

vi.mock('../../api/compendium.js');

const NOW = '2026-09-30T00:00:00.000Z';

function actorWith(
  conditions: { slug: string; value?: number; duration?: ConditionDuration }[],
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
    name: 'Hero',
    system: { ...newCharacterData(), conditions },
  };
}

const definitions = [
  {
    packId: 'conditions',
    slug: 'frightened',
    name: 'Frightened',
    kind: 'condition',
    traits: [],
  },
  { packId: 'conditions', slug: 'prone', name: 'Prone', kind: 'condition', traits: [] },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(compendiumApi.searchCompendium).mockResolvedValue(definitions);
});

async function mountPanel(
  conditions: { slug: string; value?: number }[] = [],
  editable = true,
) {
  const wrapper = mount(ConditionsPanel, {
    props: { actor: actorWith(conditions), editable },
  });
  await flushPromises();
  return wrapper;
}

describe('the list', () => {
  it('says so when there are none', async () => {
    expect((await mountPanel()).text()).toContain('No conditions');
  });

  it('names each condition in words, with its value, read-only', async () => {
    const wrapper = await mountPanel(
      [{ slug: 'frightened', value: 2 }, { slug: 'off-guard' }],
      false,
    );
    expect(wrapper.findAll('.condition').map((c) => c.text())).toEqual([
      'Frightened 2',
      'Off Guard',
    ]);
    expect(wrapper.find('button, input, select').exists()).toBe(false);
  });
});

describe('editing', () => {
  it('sets a valued condition to an exact value, which is how a GM overrides it', async () => {
    const wrapper = await mountPanel([{ slug: 'frightened', value: 3 }]);
    await wrapper.find('.condition input[type="number"]').setValue('1');
    expect(wrapper.emitted('set')).toEqual([['frightened', 1]]);
  });

  it('sets a value of 0, which removes it on the server', async () => {
    const wrapper = await mountPanel([{ slug: 'frightened', value: 3 }]);
    await wrapper.find('.condition input[type="number"]').setValue('0');
    expect(wrapper.emitted('set')).toEqual([['frightened', 0]]);
  });

  it('offers a value box only for a condition that has a value', async () => {
    const wrapper = await mountPanel([{ slug: 'prone' }]);
    expect(wrapper.find('.condition input').exists()).toBe(false);
  });

  it('removes a condition, with a button that names it', async () => {
    const wrapper = await mountPanel([{ slug: 'prone' }]);
    const button = wrapper.find('.condition button');
    expect(button.attributes('aria-label')).toBe('Remove Prone');
    await button.trigger('click');
    expect(wrapper.emitted('remove')).toEqual([['prone']]);
  });
});

describe('adding', () => {
  it('picks from the imported definitions and adds with a value', async () => {
    const wrapper = await mountPanel();
    expect(compendiumApi.searchCompendium).toHaveBeenCalledWith({
      kind: 'condition',
      limit: 200,
    });
    const options = wrapper.findAll('#condition-pick option').map((o) => o.text());
    expect(options.slice(1)).toEqual(['Frightened', 'Prone']);

    await wrapper.find('#condition-pick').setValue('frightened');
    await wrapper.find('#condition-value').setValue('2');
    await wrapper.find('form.add-condition').trigger('submit');
    expect(wrapper.emitted('add')).toEqual([['frightened', 2, undefined]]);
  });

  it('adds a condition with no value when the box is empty', async () => {
    const wrapper = await mountPanel();
    await wrapper.find('#condition-pick').setValue('prone');
    await wrapper.find('form.add-condition').trigger('submit');
    expect(wrapper.emitted('add')).toEqual([['prone', undefined, undefined]]);
  });

  it('asks for a choice rather than sending an empty one', async () => {
    const wrapper = await mountPanel();
    await wrapper.find('form.add-condition').trigger('submit');
    expect(wrapper.emitted('add')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toContain('Choose or type');
  });

  it('falls back to typing a name, made into a slug, when nothing is imported', async () => {
    vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([]);
    const wrapper = await mountPanel();
    expect(wrapper.find('#condition-pick').exists()).toBe(false);

    await wrapper.find('#condition-name').setValue('  Off Guard ');
    await wrapper.find('form.add-condition').trigger('submit');
    expect(wrapper.emitted('add')).toEqual([['off-guard', undefined, undefined]]);
  });

  it('still lets a name be typed when the compendium cannot be reached', async () => {
    vi.mocked(compendiumApi.searchCompendium).mockRejectedValue(new Error('offline'));
    const wrapper = await mountPanel();
    expect(wrapper.find('#condition-name').exists()).toBe(true);
  });

  it('does not load definitions for someone who cannot edit', async () => {
    await mountPanel([], false);
    expect(compendiumApi.searchCompendium).not.toHaveBeenCalled();
  });
});

describe('a duration (M5 C.7)', () => {
  async function mountWithCombatants(combatants: { id: string; label: string }[] = []) {
    const wrapper = mount(ConditionsPanel, {
      props: { actor: actorWith([]), editable: true, combatants },
    });
    await flushPromises();
    return wrapper;
  }

  it('sends no duration by default, same as before this feature', async () => {
    const wrapper = await mountWithCombatants();
    await wrapper.find('#condition-pick').setValue('prone');
    await wrapper.find('form.add-condition').trigger('submit');
    expect(wrapper.emitted('add')).toEqual([['prone', undefined, undefined]]);
  });

  it('sends a rounds duration', async () => {
    const wrapper = await mountWithCombatants();
    await wrapper.find('#condition-pick').setValue('prone');
    await wrapper.find('#condition-duration-type').setValue('rounds');
    await wrapper.find('#condition-duration-amount').setValue('3');
    await wrapper.find('form.add-condition').trigger('submit');
    expect(wrapper.emitted('add')).toEqual([
      ['prone', undefined, { type: 'rounds', remaining: 3 }],
    ]);
  });

  it('offers no "until a combatant\'s turn" option with no combatants', async () => {
    const wrapper = await mountWithCombatants();
    const options = wrapper
      .findAll('#condition-duration-type option')
      .map((o) => o.text());
    expect(options).not.toContain("Until a combatant's turn");
  });

  it('sends a turn duration, naming the combatant and which end', async () => {
    const wrapper = await mountWithCombatants([{ id: 'c1', label: 'Goblin' }]);
    await wrapper.find('#condition-pick').setValue('frightened');
    await wrapper.find('#condition-duration-type').setValue('turn');
    await wrapper.find('#condition-duration-combatant').setValue('c1');
    await wrapper.find('#condition-duration-boundary').setValue('start');
    await wrapper.find('form.add-condition').trigger('submit');
    expect(wrapper.emitted('add')).toEqual([
      ['frightened', undefined, { type: 'turn', combatantId: 'c1', boundary: 'start' }],
    ]);
  });

  it('sends no duration for an incomplete "until a combatant\'s turn" pick', async () => {
    const wrapper = await mountWithCombatants([{ id: 'c1', label: 'Goblin' }]);
    await wrapper.find('#condition-pick').setValue('prone');
    await wrapper.find('#condition-duration-type').setValue('turn');
    await wrapper.find('form.add-condition').trigger('submit');
    expect(wrapper.emitted('add')).toEqual([['prone', undefined, undefined]]);
  });

  it('shows how an existing condition’s duration ends, and nothing for one with none', async () => {
    const combatantId = crypto.randomUUID();
    const wrapper = mount(ConditionsPanel, {
      props: {
        actor: actorWith([
          {
            slug: 'frightened',
            value: 1,
            duration: { type: 'turn', combatantId, boundary: 'end' },
          },
          { slug: 'prone' },
        ]),
        editable: false,
        combatants: [{ id: combatantId, label: 'Goblin' }],
      },
    });
    await flushPromises();

    const rows = wrapper.findAll('.condition');
    expect(rows[0]?.find('.condition-duration').text()).toBe(
      "Ends at the end of Goblin's turn",
    );
    expect(rows[1]?.find('.condition-duration').exists()).toBe(false);
  });
});
