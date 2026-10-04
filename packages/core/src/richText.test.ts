import { describe, expect, it } from 'vitest';

import { richTextNodeSchema, richTextSchema } from './richText.js';

describe('richTextNodeSchema -- each node kind', () => {
  it('accepts a plain text node', () => {
    expect(richTextNodeSchema.safeParse({ kind: 'text', value: 'hello' }).success).toBe(
      true,
    );
  });

  it('accepts strong and em, each wrapping children', () => {
    expect(
      richTextNodeSchema.safeParse({
        kind: 'strong',
        children: [{ kind: 'text', value: 'bold' }],
      }).success,
    ).toBe(true);
    expect(
      richTextNodeSchema.safeParse({
        kind: 'em',
        children: [{ kind: 'text', value: 'italic' }],
      }).success,
    ).toBe(true);
  });

  it('accepts a paragraph', () => {
    expect(
      richTextNodeSchema.safeParse({
        kind: 'paragraph',
        children: [{ kind: 'text', value: 'a sentence' }],
      }).success,
    ).toBe(true);
  });

  it('accepts a heading at level 1, 2, or 3, and rejects level 4', () => {
    for (const level of [1, 2, 3]) {
      expect(
        richTextNodeSchema.safeParse({
          kind: 'heading',
          level,
          children: [{ kind: 'text', value: 'Title' }],
        }).success,
      ).toBe(true);
    }
    expect(
      richTextNodeSchema.safeParse({
        kind: 'heading',
        level: 4,
        children: [{ kind: 'text', value: 'Title' }],
      }).success,
    ).toBe(false);
  });

  it('accepts an ordered or unordered list of item node-lists', () => {
    const list = {
      kind: 'list',
      ordered: false,
      items: [[{ kind: 'text', value: 'first' }], [{ kind: 'text', value: 'second' }]],
    };
    expect(richTextNodeSchema.safeParse(list).success).toBe(true);
    expect(richTextNodeSchema.safeParse({ ...list, ordered: true }).success).toBe(true);
  });

  it('accepts a term, requiring termKind, slug, and label', () => {
    expect(
      richTextNodeSchema.safeParse({
        kind: 'term',
        termKind: 'condition',
        slug: 'frightened',
        label: 'Frightened',
      }).success,
    ).toBe(true);
    expect(
      richTextNodeSchema.safeParse({ kind: 'term', termKind: 'condition', slug: 'x' })
        .success,
    ).toBe(false);
  });

  it('rejects an unrecognized termKind', () => {
    expect(
      richTextNodeSchema.safeParse({
        kind: 'term',
        termKind: 'hazard',
        slug: 'pit-trap',
        label: 'Pit Trap',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown node kind', () => {
    expect(richTextNodeSchema.safeParse({ kind: 'span', value: 'x' }).success).toBe(
      false,
    );
  });
});

describe('richTextNodeSchema -- nesting', () => {
  it('accepts a term nested inside a paragraph inside a list item', () => {
    const value = {
      kind: 'list',
      ordered: true,
      items: [
        [
          {
            kind: 'paragraph',
            children: [
              { kind: 'text', value: 'See ' },
              {
                kind: 'term',
                termKind: 'trait',
                slug: 'agile',
                label: 'agile',
              },
              { kind: 'text', value: '.' },
            ],
          },
        ],
      ],
    };
    expect(richTextNodeSchema.safeParse(value).success).toBe(true);
  });
});

describe('richTextSchema', () => {
  it('accepts an empty array (no text to show yet)', () => {
    expect(richTextSchema.safeParse([]).success).toBe(true);
  });

  it('accepts a sequence of top-level nodes', () => {
    const value = [
      { kind: 'heading', level: 2, children: [{ kind: 'text', value: 'Title' }] },
      { kind: 'paragraph', children: [{ kind: 'text', value: 'Body.' }] },
    ];
    expect(richTextSchema.safeParse(value).success).toBe(true);
  });
});
