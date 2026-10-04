import { describe, expect, it } from 'vitest';

import { htmlToRichText } from './htmlToRichText.js';

describe('htmlToRichText -- basic structure', () => {
  it('converts a paragraph of plain text', () => {
    expect(htmlToRichText('<p>Hello there.</p>')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: 'Hello there.' }] },
    ]);
  });

  it('converts strong and em inside a paragraph', () => {
    expect(
      htmlToRichText('<p>You are <strong>frightened</strong> and <em>sickened</em>.</p>'),
    ).toEqual([
      {
        kind: 'paragraph',
        children: [
          { kind: 'text', value: 'You are ' },
          { kind: 'strong', children: [{ kind: 'text', value: 'frightened' }] },
          { kind: 'text', value: ' and ' },
          { kind: 'em', children: [{ kind: 'text', value: 'sickened' }] },
          { kind: 'text', value: '.' },
        ],
      },
    ]);
  });

  it('accepts <b> and <i> as synonyms for <strong> and <em>', () => {
    expect(htmlToRichText('<p><b>bold</b> <i>italic</i></p>')).toEqual([
      {
        kind: 'paragraph',
        children: [
          { kind: 'strong', children: [{ kind: 'text', value: 'bold' }] },
          { kind: 'text', value: ' ' },
          { kind: 'em', children: [{ kind: 'text', value: 'italic' }] },
        ],
      },
    ]);
  });

  it('converts headings 1-3 directly, and clamps 4-6 to level 3', () => {
    expect(htmlToRichText('<h1>One</h1>')).toEqual([
      { kind: 'heading', level: 1, children: [{ kind: 'text', value: 'One' }] },
    ]);
    expect(htmlToRichText('<h3>Three</h3>')).toEqual([
      { kind: 'heading', level: 3, children: [{ kind: 'text', value: 'Three' }] },
    ]);
    expect(htmlToRichText('<h6>Six</h6>')).toEqual([
      { kind: 'heading', level: 3, children: [{ kind: 'text', value: 'Six' }] },
    ]);
  });

  it('converts an unordered and an ordered list', () => {
    expect(htmlToRichText('<ul><li>one</li><li>two</li></ul>')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', value: 'one' }], [{ kind: 'text', value: 'two' }]],
      },
    ]);
    expect(htmlToRichText('<ol><li>first</li></ol>')).toEqual([
      { kind: 'list', ordered: true, items: [[{ kind: 'text', value: 'first' }]] },
    ]);
  });

  it('handles a nested list inside a list item', () => {
    expect(htmlToRichText('<ul><li>outer<ul><li>inner</li></ul></li></ul>')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [
          [
            { kind: 'text', value: 'outer' },
            {
              kind: 'list',
              ordered: false,
              items: [[{ kind: 'text', value: 'inner' }]],
            },
          ],
        ],
      },
    ]);
  });

  it('turns <br> into a literal newline in the surrounding text', () => {
    expect(htmlToRichText('<p>Line one<br>Line two</p>')).toEqual([
      {
        kind: 'paragraph',
        children: [{ kind: 'text', value: 'Line one\nLine two' }],
      },
    ]);
  });

  it('allows a bare top-level text run with no wrapping paragraph', () => {
    expect(htmlToRichText('Just some text, no tags at all.')).toEqual([
      { kind: 'text', value: 'Just some text, no tags at all.' },
    ]);
  });

  it('collapses internal whitespace, including newlines from pretty-printed HTML', () => {
    expect(htmlToRichText('<p>\n  Line one\n  Line two\n</p>')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: 'Line one Line two' }] },
    ]);
  });

  it('decodes HTML entities', () => {
    expect(htmlToRichText('<p>5&ndash;10 feet &amp; a DC</p>')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: '5–10 feet & a DC' }] },
    ]);
  });
});

describe('htmlToRichText -- tables degrade to a list', () => {
  it('turns each row into a list item, cells joined with " | "', () => {
    const html =
      '<table><tr><th>Rank</th><th>DC</th></tr><tr><td>Trained</td><td>15</td></tr></table>';
    expect(htmlToRichText(html)).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [
          [{ kind: 'text', value: 'Rank | DC' }],
          [{ kind: 'text', value: 'Trained | 15' }],
        ],
      },
    ]);
  });
});

describe('htmlToRichText -- action-glyph spans', () => {
  it('drops the span and its text content entirely', () => {
    expect(
      htmlToRichText('<p>Stride <span class="action-glyph">1</span> twice.</p>'),
    ).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: 'Stride  twice.' }] },
    ]);
  });

  it('leaves a span with a different class alone (transparent, content kept)', () => {
    expect(htmlToRichText('<p><span class="trait">agile</span></p>')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: 'agile' }] },
    ]);
  });
});

describe('htmlToRichText -- unrecognized tags are transparent', () => {
  it('flattens an unknown tag, keeping its content', () => {
    expect(htmlToRichText('<div>Some <a href="#">linked</a> text.</div>')).toEqual([
      { kind: 'text', value: 'Some linked text.' },
    ]);
  });

  it('produces nothing for a void element with no text (hr, img)', () => {
    // Not nested in a <p>: a real browser (and htmlparser2, matching it)
    // auto-closes <p> before a block element like <hr>, which is a
    // real HTML5 parsing rule, not something this module needs to handle.
    expect(htmlToRichText('Before<hr>After')).toEqual([
      { kind: 'text', value: 'BeforeAfter' },
    ]);
    expect(htmlToRichText('<p>Before<img src="x.png">After</p>')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: 'BeforeAfter' }] },
    ]);
  });
});

describe('htmlToRichText -- malformed input never throws', () => {
  it('still returns a value for an unclosed tag', () => {
    expect(() => htmlToRichText('<p>Unclosed paragraph')).not.toThrow();
    expect(htmlToRichText('<p>Unclosed paragraph')).toEqual([
      { kind: 'paragraph', children: [{ kind: 'text', value: 'Unclosed paragraph' }] },
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(htmlToRichText('')).toEqual([]);
  });
});
