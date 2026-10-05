// @vitest-environment jsdom
import type { CompendiumEntry, TermKind } from '@hearthtable/core';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RulesTerm from './RulesTerm.vue';
import { useRulesStore } from '../stores/rules.js';

vi.mock('../stores/rules.js', () => ({ useRulesStore: vi.fn() }));

const NOW = '2026-10-04T00:00:00.000Z';

function makeEntry(text: CompendiumEntry['text']): CompendiumEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'conditions',
    slug: 'frightened',
    name: 'Frightened',
    kind: 'condition',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    traits: [],
    ruleElements: [],
    description: '',
    text,
  };
}

function stubStore(
  getEntry: ReturnType<typeof vi.fn> = vi.fn(),
  getTrait: ReturnType<typeof vi.fn> = vi.fn(),
): void {
  vi.mocked(useRulesStore).mockReturnValue({
    getEntry,
    getTrait,
  } as unknown as ReturnType<typeof useRulesStore>);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

function render(
  overrides: Partial<{ termKind: TermKind; slug: string; label: string }> = {},
) {
  return mount(RulesTerm, {
    props: {
      termKind: 'condition',
      slug: 'frightened',
      label: 'Frightened',
      ...overrides,
    },
  });
}

describe('RulesTerm', () => {
  it('shows the label, closed, with no fetch until opened', () => {
    const getEntry = vi.fn();
    stubStore(getEntry);

    const wrapper = render();

    expect(wrapper.find('.rules-term').text()).toBe('Frightened');
    expect(wrapper.find('.rules-term-popover').exists()).toBe(false);
    expect(getEntry).not.toHaveBeenCalled();
  });

  it('opens on hover and renders the fetched entry text', async () => {
    const getEntry = vi
      .fn()
      .mockResolvedValue(
        makeEntry([
          { kind: 'paragraph', children: [{ kind: 'text', value: 'You are afraid.' }] },
        ]),
      );
    stubStore(getEntry);

    const wrapper = render();
    await wrapper.find('.rules-term-wrapper').trigger('mouseenter');
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(getEntry).toHaveBeenCalledWith('conditions', 'frightened');
    expect(wrapper.find('.rules-term-popover').text()).toContain('You are afraid.');
  });

  it('opens on focus', async () => {
    const getEntry = vi.fn().mockResolvedValue(undefined);
    stubStore(getEntry);

    const wrapper = render();
    await wrapper.find('.rules-term').trigger('focus');

    expect(wrapper.find('.rules-term-popover').exists()).toBe(true);
  });

  it('opens and closes on tap (click toggles)', async () => {
    const getEntry = vi.fn().mockResolvedValue(undefined);
    stubStore(getEntry);

    const wrapper = render();
    const button = wrapper.find('.rules-term');
    await button.trigger('click');
    expect(wrapper.find('.rules-term-popover').exists()).toBe(true);

    await button.trigger('click');
    expect(wrapper.find('.rules-term-popover').exists()).toBe(false);
  });

  it('closes on Escape', async () => {
    const getEntry = vi.fn().mockResolvedValue(undefined);
    stubStore(getEntry);

    const wrapper = render();
    await wrapper.find('.rules-term').trigger('click');
    expect(wrapper.find('.rules-term-popover').exists()).toBe(true);

    await wrapper.find('.rules-term').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.rules-term-popover').exists()).toBe(false);
  });

  it("closes via the popover's own close button", async () => {
    const getEntry = vi.fn().mockResolvedValue(undefined);
    stubStore(getEntry);

    const wrapper = render();
    await wrapper.find('.rules-term').trigger('click');
    await wrapper.find('.rules-term-popover-close').trigger('click');

    expect(wrapper.find('.rules-term-popover').exists()).toBe(false);
  });

  it('closes a short delay after the pointer leaves, cancelled by re-entering the popover', async () => {
    vi.useFakeTimers();
    const getEntry = vi.fn().mockResolvedValue(undefined);
    stubStore(getEntry);

    const wrapper = render();
    await wrapper.find('.rules-term-wrapper').trigger('mouseenter');
    expect(wrapper.find('.rules-term-popover').exists()).toBe(true);

    await wrapper.find('.rules-term-wrapper').trigger('mouseleave');
    await wrapper.find('.rules-term-popover').trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(200);
    expect(wrapper.find('.rules-term-popover').exists()).toBe(true);

    await wrapper.find('.rules-term-popover').trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(200);
    expect(wrapper.find('.rules-term-popover').exists()).toBe(false);
  });

  it('opens a trait term through getTrait, not getEntry, and renders its text', async () => {
    const getEntry = vi.fn();
    const getTrait = vi.fn().mockResolvedValue({
      slug: 'agile',
      name: 'Agile',
      text: [{ kind: 'text', value: 'Reduces the Multiple Attack Penalty.' }],
    });
    stubStore(getEntry, getTrait);

    const wrapper = render({ termKind: 'trait', slug: 'agile', label: 'agile' });
    await wrapper.find('.rules-term').trigger('click');
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(getTrait).toHaveBeenCalledWith('agile');
    expect(getEntry).not.toHaveBeenCalled();
    expect(wrapper.find('.rules-term-popover').text()).toContain(
      'Reduces the Multiple Attack Penalty.',
    );
  });

  it('shows "No details yet" for a trait the glossary has no entry for', async () => {
    const getTrait = vi.fn().mockResolvedValue(undefined);
    stubStore(vi.fn(), getTrait);

    const wrapper = render({
      termKind: 'trait',
      slug: 'no-such-trait',
      label: 'mystery',
    });
    await wrapper.find('.rules-term').trigger('click');
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.rules-term-empty').text()).toBe('No details yet.');
  });

  it("shows 'No details yet' when the server has no entry at that slug", async () => {
    const getEntry = vi.fn().mockResolvedValue(undefined);
    stubStore(getEntry);

    const wrapper = render();
    await wrapper.find('.rules-term').trigger('click');
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.rules-term-empty').text()).toBe('No details yet.');
  });

  it('renders a nested term inside the popover as its own RulesTerm, with its own popover', async () => {
    const getEntry = vi.fn().mockResolvedValue(
      makeEntry([
        {
          kind: 'paragraph',
          children: [
            { kind: 'text', value: 'See ' },
            { kind: 'term', termKind: 'trait', slug: 'agile', label: 'agile' },
            { kind: 'text', value: '.' },
          ],
        },
      ]),
    );
    const getTrait = vi.fn().mockResolvedValue({
      slug: 'agile',
      name: 'Agile',
      text: [{ kind: 'text', value: 'Reduces the second attack penalty.' }],
    });
    stubStore(getEntry, getTrait);

    const wrapper = render();
    await wrapper.find('.rules-term').trigger('click');
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    const nestedTerms = wrapper.findAll('.rules-term-popover .rules-term');
    expect(nestedTerms).toHaveLength(1);
    expect(nestedTerms[0]?.text()).toBe('agile');

    // Clicking it opens its *own* popover, stacked on top -- not swapped in
    // place of the outer one (this is what a plain `<span>` could never do).
    await nestedTerms[0]?.trigger('click');
    await wrapper.vm.$nextTick();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(getTrait).toHaveBeenCalledWith('agile');
    const popovers = wrapper.findAll('.rules-term-popover');
    expect(popovers).toHaveLength(2);
    expect(popovers[1]?.text()).toContain('Reduces the second attack penalty.');
  });
});
