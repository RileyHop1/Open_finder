// @vitest-environment jsdom
import type {
  ChatCheckMessage,
  ChatStrikeAttackMessage,
  ChatStrikeDamageMessage,
} from '@hearthtable/core';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatRollCard from './ChatRollCard.vue';
import { useChatStore } from '../stores/chat.js';

vi.mock('../stores/chat.js', () => ({ useChatStore: vi.fn() }));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(useChatStore).mockReturnValue({
    adjustRoll: vi.fn(),
  } as unknown as ReturnType<typeof useChatStore>);
});

const NOW = '2026-09-30T00:00:00.000Z';
const base = {
  id: crypto.randomUUID(),
  worldId: crypto.randomUUID(),
  type: 'chatMessage' as const,
  schemaVersion: 1,
  permissions: { default: 'observer' as const, seats: {} },
  createdAt: NOW,
  updatedAt: NOW,
  seatId: crypto.randomUUID(),
  actorId: crypto.randomUUID(),
  actorName: 'Valeria',
};

const modifier = (
  slug: string,
  label: string,
  type: 'ability' | 'proficiency' | 'status' | 'item',
  value: number,
  extra: { applied?: boolean; suppressedBy?: string } = {},
) => ({
  slug,
  label,
  type,
  value,
  source: label,
  enabled: true,
  applied: true,
  ...extra,
});

const check: ChatCheckMessage = {
  ...base,
  kind: 'check',
  statistic: 'skill:athletics',
  label: 'Athletics',
  dc: 20,
  breakdown: {
    total: 9,
    modifiers: [
      modifier('str', 'Strength', 'ability', 4),
      modifier('prof', 'Trained', 'proficiency', 5),
      modifier('a', 'Blessing', 'status', 1, { applied: false, suppressedBy: 'bless' }),
    ],
  },
  roll: {
    expression: '1d20+9',
    total: 22,
    natural: 13,
    degree: 'success',
    terms: [
      { kind: 'die', faces: 20, result: 13, kept: true, value: 13 },
      { kind: 'constant', value: 9 },
    ],
  },
};

const attack: ChatStrikeAttackMessage = {
  ...base,
  kind: 'strikeAttack',
  itemId: crypto.randomUUID(),
  weaponName: 'Invented Sword',
  attackNumber: 2,
  breakdown: {
    total: 2,
    modifiers: [modifier('map', 'Multiple Attack Penalty', 'item', -5)],
  },
  roll: {
    expression: '1d20+2',
    total: 12,
    natural: 10,
    terms: [{ kind: 'die', faces: 20, result: 10, kept: true, value: 10 }],
  },
};

const damage: ChatStrikeDamageMessage = {
  ...base,
  kind: 'strikeDamage',
  itemId: crypto.randomUUID(),
  weaponName: 'Invented Sword',
  critical: true,
  breakdown: { total: 4, modifiers: [modifier('str', 'Strength', 'ability', 4)] },
  roll: {
    expression: '1d8+4',
    total: 18,
    damage: { slashing: 15, fire: 3 },
    terms: [{ kind: 'die', faces: 8, result: 5, kept: true, value: 10 }],
  },
};

const render = (
  message: ChatCheckMessage | ChatStrikeAttackMessage | ChatStrikeDamageMessage,
  isGm = false,
) => mount(ChatRollCard, { props: { message, sender: 'Riley', isGm } });

describe('a check', () => {
  it('names the character, the statistic and the roller, and reads the result in words', () => {
    const wrapper = render(check);
    expect(wrapper.find('.title').text()).toBe('Valeria: Athletics — rolled by Riley');
    expect(wrapper.find('.result').text()).toBe('Total 22 vs DC 20 — Success');
    expect(wrapper.find('.natural').text()).toBe('d20: 13');
  });

  it('omits the DC and degree when none was given', () => {
    const { dc: _dc, ...noDc } = check;
    const wrapper = render({ ...noDc, roll: { ...check.roll, degree: undefined } });
    expect(wrapper.find('.result').text()).toBe('Total 22');
  });

  it('shows every modifier, and says in words why a suppressed one did not count', () => {
    const wrapper = render(check);
    expect(wrapper.find('.modifiers-heading').text()).toBe('Bonus +9');
    const lines = wrapper.findAll('.modifiers li').map((li) => li.text());
    expect(lines).toEqual([
      '+4 Strength (ability)',
      '+5 Trained (proficiency)',
      '+1 Blessing (status) — not applied: Bless is better',
    ]);
    expect(wrapper.findAll('.modifiers li')[2]?.classes()).toContain('unapplied');
    expect(wrapper.findAll('.terms li').map((li) => li.text())).toEqual([
      'd20: 13',
      '+9',
    ]);
  });

  it('puts the breakdown behind a keyboard-reachable disclosure', () => {
    expect(render(check).find('details.roll-breakdown summary').text()).toBe('Breakdown');
  });
});

describe('a strike attack', () => {
  it('names the weapon and which attack of the turn it was, with the penalty visible', () => {
    const wrapper = render(attack);
    expect(wrapper.find('.title').text()).toContain('Valeria: Invented Sword attack');
    expect(wrapper.find('.step').text()).toBe('Second attack of the turn');
    expect(wrapper.find('.modifiers').text()).toContain('−5 Multiple Attack Penalty');
    expect(wrapper.find('.result').text()).toBe('Total 12');
  });

  it('names who it was against, next to the DC, when a target was picked', () => {
    const wrapper = render({ ...attack, dc: 18, targetName: 'Goblin' });
    expect(wrapper.find('.result').text()).toBe('Total 12 vs Goblin (DC 18)');
  });

  it('falls back to a bare DC when no target was named (an untargeted swing, or a hidden one)', () => {
    const wrapper = render({ ...attack, dc: 18 });
    expect(wrapper.find('.result').text()).toBe('Total 12 vs DC 18');
  });

  it('says it was flanking when the DC was lowered by it (M5 C.10)', () => {
    const wrapper = render({ ...attack, dc: 18, targetName: 'Goblin', flanking: true });
    expect(wrapper.find('.result').text()).toBe('Total 12 vs Goblin (DC 18) (flanking)');
  });

  it('says nothing about flanking when it did not apply', () => {
    const wrapper = render({ ...attack, dc: 18 });
    expect(wrapper.find('.result').text()).not.toContain('flanking');
  });
});

describe('strike damage', () => {
  it('shows damage by type and marks a critical in words', () => {
    const wrapper = render(damage);
    expect(wrapper.find('.title').text()).toContain('Invented Sword damage (critical)');
    expect(wrapper.find('.damage').text()).toBe('15 slashing, 3 fire');
    expect(wrapper.find('.modifiers-heading').text()).toBe('Damage modifier +4');
    expect(wrapper.find('.natural').exists()).toBe(false);
  });

  it('does not say critical for an ordinary hit', () => {
    expect(
      render({ ...damage, critical: false })
        .find('.title')
        .text(),
    ).not.toContain('critical');
  });
});

describe('the GM editing a roll', () => {
  it('shows nothing extra, and no edit control, for a non-GM viewer', () => {
    const wrapper = render(check, false);
    expect(wrapper.find('.gm-edit-toggle').exists()).toBe(false);
  });

  it('shows "GM set to N (rolled M)" once gmTotal is set', () => {
    const wrapper = render({ ...check, gmTotal: 30 }, true);
    expect(wrapper.find('.result').text()).toBe(
      'GM set to 30 (rolled 22) vs DC 20 — Success',
    );
  });

  it('offers an edit control to the GM, which sends chat.adjustRoll with the typed total', async () => {
    const adjustRoll = vi.fn();
    vi.mocked(useChatStore).mockReturnValue({
      adjustRoll,
    } as unknown as ReturnType<typeof useChatStore>);
    const wrapper = render(check, true);

    await wrapper.find('.gm-edit-toggle').trigger('click');
    await wrapper.find('.gm-edit input').setValue('30');
    await wrapper.find('.gm-edit').trigger('submit');

    expect(adjustRoll).toHaveBeenCalledWith(check.id, 30);
  });

  it('cancels without sending anything', async () => {
    const adjustRoll = vi.fn();
    vi.mocked(useChatStore).mockReturnValue({
      adjustRoll,
    } as unknown as ReturnType<typeof useChatStore>);
    const wrapper = render(check, true);

    await wrapper.find('.gm-edit-toggle').trigger('click');
    await wrapper.find('.gm-edit button[type="button"]').trigger('click');

    expect(wrapper.find('.gm-edit').exists()).toBe(false);
    expect(adjustRoll).not.toHaveBeenCalled();
  });
});
