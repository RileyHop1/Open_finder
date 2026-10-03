// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import { newCharacterData } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import DyingPanel from './DyingPanel.vue';
import { makeNpc } from './testNpc.js';

const NOW = '2026-09-30T00:00:00.000Z';

function actorWith(conditions: { slug: string; value?: number }[]): Actor {
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

function npcWith(conditions: { slug: string; value?: number }[]): Actor {
  const npc = makeNpc();
  return { ...npc, system: { ...(npc.system as object), conditions } };
}

describe('DyingPanel', () => {
  it('renders nothing when none of the five dying-chain conditions apply', () => {
    const wrapper = mount(DyingPanel, {
      props: { actor: actorWith([{ slug: 'frightened', value: 1 }]), editable: true },
    });
    expect(wrapper.find('.dying-panel').exists()).toBe(false);
  });

  it('shows the status line and read-only when not editable', () => {
    const wrapper = mount(DyingPanel, {
      props: { actor: actorWith([{ slug: 'dying', value: 2 }]), editable: false },
    });
    expect(wrapper.find('.status').text()).toBe('dying 2');
    expect(wrapper.find('.dying-list').exists()).toBe(false);
  });

  it('lets an owner set a valued slug and remove any present slug', async () => {
    const wrapper = mount(DyingPanel, {
      props: {
        actor: actorWith([{ slug: 'dying', value: 1 }, { slug: 'unconscious' }]),
        editable: true,
      },
    });
    expect(wrapper.text()).toContain('Unconscious, dying 1');

    await wrapper.get('input[type="number"]').setValue(3);
    expect(wrapper.emitted('set')).toEqual([['dying', 3]]);

    await wrapper.get('button[aria-label="Remove Unconscious"]').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([['unconscious']]);
  });

  it('offers "Roll recovery check" only for a GM, a dying character, not dead', () => {
    const dyingCharacter = actorWith([{ slug: 'dying', value: 1 }]);

    const asGm = mount(DyingPanel, {
      props: { actor: dyingCharacter, editable: true, isGm: true },
    });
    expect(asGm.find('button.roll-recovery').exists()).toBe(true);

    const asPlayer = mount(DyingPanel, {
      props: { actor: dyingCharacter, editable: true, isGm: false },
    });
    expect(asPlayer.find('button.roll-recovery').exists()).toBe(false);

    const dead = mount(DyingPanel, {
      props: {
        actor: actorWith([{ slug: 'dead' }, { slug: 'dying', value: 4 }]),
        editable: true,
        isGm: true,
      },
    });
    expect(dead.find('button.roll-recovery').exists()).toBe(false);

    const npc = mount(DyingPanel, {
      props: {
        actor: npcWith([{ slug: 'dying', value: 1 }]),
        editable: true,
        isGm: true,
      },
    });
    expect(npc.find('button.roll-recovery').exists()).toBe(false);
  });

  it('emits rollRecovery on click', async () => {
    const wrapper = mount(DyingPanel, {
      props: {
        actor: actorWith([{ slug: 'dying', value: 1 }]),
        editable: true,
        isGm: true,
      },
    });
    await wrapper.get('button.roll-recovery').trigger('click');
    expect(wrapper.emitted('rollRecovery')).toEqual([[]]);
  });
});
