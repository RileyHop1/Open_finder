// @vitest-environment jsdom
import type { RichText } from '@hearthtable/core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import RulesText from './RulesText.vue';

function render(nodes: RichText) {
  return mount(RulesText, { props: { nodes } });
}

describe('RulesText', () => {
  it('renders a plain text node', () => {
    expect(render([{ kind: 'text', value: 'Hello there.' }]).text()).toBe('Hello there.');
  });

  it('renders strong and em', () => {
    const wrapper = render([
      { kind: 'strong', children: [{ kind: 'text', value: 'bold' }] },
      { kind: 'text', value: ' ' },
      { kind: 'em', children: [{ kind: 'text', value: 'italic' }] },
    ]);
    expect(wrapper.find('strong').text()).toBe('bold');
    expect(wrapper.find('em').text()).toBe('italic');
  });

  it('renders a paragraph', () => {
    const wrapper = render([
      { kind: 'paragraph', children: [{ kind: 'text', value: 'A sentence.' }] },
    ]);
    expect(wrapper.find('p').text()).toBe('A sentence.');
  });

  it('renders a heading at the right level', () => {
    const wrapper = render([
      { kind: 'heading', level: 2, children: [{ kind: 'text', value: 'Title' }] },
    ]);
    expect(wrapper.find('h2').text()).toBe('Title');
  });

  it('renders an unordered and an ordered list', () => {
    const unordered = render([
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', value: 'one' }], [{ kind: 'text', value: 'two' }]],
      },
    ]);
    expect(unordered.find('ul').exists()).toBe(true);
    expect(unordered.findAll('li').map((li) => li.text())).toEqual(['one', 'two']);

    const ordered = render([
      { kind: 'list', ordered: true, items: [[{ kind: 'text', value: 'first' }]] },
    ]);
    expect(ordered.find('ol').exists()).toBe(true);
  });

  it('renders a term as marked-up text, with no popover yet', () => {
    const wrapper = render([
      { kind: 'term', termKind: 'condition', slug: 'frightened', label: 'Frightened' },
    ]);
    const term = wrapper.find('.rules-term');
    expect(term.text()).toBe('Frightened');
  });

  it('recurses into nested structure: a term inside a paragraph inside a list item', () => {
    const wrapper = render([
      {
        kind: 'list',
        ordered: false,
        items: [
          [
            {
              kind: 'paragraph',
              children: [
                { kind: 'text', value: 'See ' },
                { kind: 'term', termKind: 'trait', slug: 'agile', label: 'agile' },
                { kind: 'text', value: '.' },
              ],
            },
          ],
        ],
      },
    ]);
    expect(wrapper.find('li p .rules-term').text()).toBe('agile');
    expect(wrapper.find('li p').text()).toBe('See agile.');
  });

  it('renders nothing for an empty array', () => {
    expect(render([]).text()).toBe('');
  });
});
