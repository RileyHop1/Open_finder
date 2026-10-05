import { describe, expect, it } from 'vitest';

import { parseBookPage, parseInline } from './bookPageParser.js';

describe('parseInline', () => {
  it('returns a single plain text node for text with no markup', () => {
    expect(parseInline('A sentence.')).toEqual([{ kind: 'text', value: 'A sentence.' }]);
  });

  it('parses bold and italic', () => {
    expect(parseInline('**bold**')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', value: 'bold' }] },
    ]);
    expect(parseInline('_italic_')).toEqual([
      { kind: 'em', children: [{ kind: 'text', value: 'italic' }] },
    ]);
  });

  it('mixes plain text with bold, italic, and a term in one span', () => {
    expect(parseInline('See **bold** and _italic_ and {condition:frightened}.')).toEqual([
      { kind: 'text', value: 'See ' },
      { kind: 'strong', children: [{ kind: 'text', value: 'bold' }] },
      { kind: 'text', value: ' and ' },
      { kind: 'em', children: [{ kind: 'text', value: 'italic' }] },
      { kind: 'text', value: ' and ' },
      {
        kind: 'term',
        termKind: 'condition',
        slug: 'frightened',
        label: 'Frightened',
      },
      { kind: 'text', value: '.' },
    ]);
  });

  it('title-cases a hyphenated slug into the term label', () => {
    expect(parseInline('{action:take-cover}')).toEqual([
      { kind: 'term', termKind: 'action', slug: 'take-cover', label: 'Take Cover' },
    ]);
  });

  it('accepts every real TermKind', () => {
    for (const kind of ['condition', 'trait', 'action', 'spell', 'feat']) {
      expect(parseInline(`{${kind}:x}`)).toEqual([
        { kind: 'term', termKind: kind, slug: 'x', label: 'X' },
      ]);
    }
  });

  it('degrades an unknown kind to plain text rather than failing', () => {
    expect(parseInline('{bogus:frightened}')).toEqual([
      { kind: 'text', value: '{bogus:frightened}' },
    ]);
  });

  it('degrades a malformed term (no colon, or an empty slug) to plain text', () => {
    expect(parseInline('{condition}')).toEqual([{ kind: 'text', value: '{condition}' }]);
    expect(parseInline('{condition:}')).toEqual([
      { kind: 'text', value: '{condition:}' },
    ]);
  });

  it('degrades an unmatched bold or italic delimiter to a literal character', () => {
    expect(parseInline('3 ** 4')).toEqual([{ kind: 'text', value: '3 ** 4' }]);
    expect(parseInline('a _ b')).toEqual([{ kind: 'text', value: 'a _ b' }]);
  });

  it('degrades an unmatched brace to a literal character', () => {
    expect(parseInline('a { b')).toEqual([{ kind: 'text', value: 'a { b' }]);
  });

  it('recurses into bold/italic content, so a term inside bold still opens its own tooltip', () => {
    expect(parseInline('**see {condition:prone}**')).toEqual([
      {
        kind: 'strong',
        children: [
          { kind: 'text', value: 'see ' },
          { kind: 'term', termKind: 'condition', slug: 'prone', label: 'Prone' },
        ],
      },
    ]);
  });
});

describe('parseBookPage', () => {
  it('parses a single paragraph', () => {
    expect(parseBookPage('A short page.')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: 'A short page.' }] },
    ]);
  });

  it('splits on blank lines into separate paragraphs', () => {
    expect(parseBookPage('First.\n\nSecond.')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: 'First.' }] },
      { kind: 'paragraph', children: [{ kind: 'text', value: 'Second.' }] },
    ]);
  });

  it('joins soft-wrapped lines within one paragraph with a space', () => {
    expect(parseBookPage('One line\nwrapped onto another.')).toEqual([
      {
        kind: 'paragraph',
        children: [{ kind: 'text', value: 'One line wrapped onto another.' }],
      },
    ]);
  });

  it('parses a heading at each level', () => {
    expect(parseBookPage('# Title')).toEqual([
      { kind: 'heading', level: 1, children: [{ kind: 'text', value: 'Title' }] },
    ]);
    expect(parseBookPage('## Subtitle')).toEqual([
      { kind: 'heading', level: 2, children: [{ kind: 'text', value: 'Subtitle' }] },
    ]);
    expect(parseBookPage('### Detail')).toEqual([
      { kind: 'heading', level: 3, children: [{ kind: 'text', value: 'Detail' }] },
    ]);
  });

  it('clamps a deeper heading to level 3, the same ceiling htmlToRichText uses', () => {
    expect(parseBookPage('#### Too deep')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: '#### Too deep' }] },
    ]);
  });

  it('parses an unordered list', () => {
    expect(parseBookPage('- one\n- two\n- three')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [
          [{ kind: 'text', value: 'one' }],
          [{ kind: 'text', value: 'two' }],
          [{ kind: 'text', value: 'three' }],
        ],
      },
    ]);
  });

  it('parses an ordered list', () => {
    expect(parseBookPage('1. first\n2. second')).toEqual([
      {
        kind: 'list',
        ordered: true,
        items: [[{ kind: 'text', value: 'first' }], [{ kind: 'text', value: 'second' }]],
      },
    ]);
  });

  it('falls back to a paragraph for a block mixing list and non-list lines', () => {
    expect(parseBookPage('- one\nnot a list line')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: '- one not a list line' }] },
    ]);
  });

  it('parses a term inside a list item', () => {
    expect(parseBookPage('- see {trait:agile}')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [
          [
            { kind: 'text', value: 'see ' },
            { kind: 'term', termKind: 'trait', slug: 'agile', label: 'Agile' },
          ],
        ],
      },
    ]);
  });

  it('parses a whole page of mixed constructs', () => {
    const page = parseBookPage(
      [
        '# Your Turn',
        '',
        'Each turn you get **three actions** and one reaction.',
        '',
        '- {action:stride}',
        '- {action:step}',
      ].join('\n'),
    );
    expect(page.map((node) => node.kind)).toEqual(['heading', 'paragraph', 'list']);
  });

  it('returns an empty array for a blank page', () => {
    expect(parseBookPage('')).toEqual([]);
    expect(parseBookPage('   \n\n  ')).toEqual([]);
  });
});
