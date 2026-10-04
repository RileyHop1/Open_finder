import type { RichText } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import {
  applyInlineSyntax,
  type ResolveUuid,
  type UuidResolution,
} from './inlineSyntax.js';

const noResolution: ResolveUuid = () => undefined;

function paragraph(value: string): RichText {
  return [{ kind: 'paragraph', children: [{ kind: 'text', value }] }];
}

function textOf(richText: RichText): string {
  const [first] = richText;
  if (first?.kind !== 'paragraph') {
    throw new Error('test setup: expected a single paragraph');
  }
  return first.children
    .map((child) => {
      if (child.kind === 'text') {
        return child.value;
      }
      if (child.kind === 'term') {
        return `[term:${child.slug}]`;
      }
      throw new Error(`test setup: unexpected node kind ${child.kind}`);
    })
    .join('');
}

describe('applyInlineSyntax -- @UUID', () => {
  it('becomes a term node when resolveUuid recognizes the path', () => {
    const resolve: ResolveUuid = (path) =>
      path === 'Compendium.pf2e.conditionitems.Item.abc'
        ? { termKind: 'condition', slug: 'frightened', label: 'Frightened' }
        : undefined;
    const result = applyInlineSyntax(
      paragraph('You are @UUID[Compendium.pf2e.conditionitems.Item.abc]{Frightened}.'),
      resolve,
    );
    expect(result.richText).toEqual([
      {
        kind: 'paragraph',
        children: [
          { kind: 'text', value: 'You are ' },
          {
            kind: 'term',
            termKind: 'condition',
            slug: 'frightened',
            label: 'Frightened',
          },
          { kind: 'text', value: '.' },
        ],
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("prefers the resolved entry's own label when the source gives no literal label", () => {
    const resolve: ResolveUuid = () => ({
      termKind: 'condition',
      slug: 'frightened',
      label: 'Frightened',
    });
    const result = applyInlineSyntax(
      paragraph('@UUID[Compendium.pf2e.x.Item.abc]'),
      resolve,
    );
    expect(result.richText).toEqual([
      {
        kind: 'paragraph',
        children: [
          {
            kind: 'term',
            termKind: 'condition',
            slug: 'frightened',
            label: 'Frightened',
          },
        ],
      },
    ]);
  });

  it('falls back to the literal label when the path does not resolve', () => {
    const result = applyInlineSyntax(
      paragraph('@UUID[Compendium.pf2e.feats-srd.Item.xyz]{Toughness}'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('Toughness');
    expect(result.warnings).toEqual([]);
  });

  it('keeps the raw markup visible and warns when neither a label nor a resolution exists', () => {
    const result = applyInlineSyntax(
      paragraph('See @UUID[Compendium.pf2e.feats-srd.Item.xyz] for details.'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe(
      'See @UUID[Compendium.pf2e.feats-srd.Item.xyz] for details.',
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('unresolved @UUID');
  });
});

describe('applyInlineSyntax -- @Check', () => {
  it('becomes "DC N Name"', () => {
    const result = applyInlineSyntax(
      paragraph('Attempt a @Check[reflex|dc:20|basic] save.'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('Attempt a DC 20 Reflex save.');
  });

  it('joins multiple check names with "or"', () => {
    const result = applyInlineSyntax(
      paragraph('Make a @Check[arcane,occultism|dc:20] check.'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('Make a DC 20 Arcane or Occultism check.');
  });

  it('omits the DC when none was given', () => {
    const result = applyInlineSyntax(paragraph('@Check[perception]'), noResolution);
    expect(textOf(result.richText)).toBe('Perception');
  });

  it('produces no warnings', () => {
    const result = applyInlineSyntax(paragraph('@Check[will|dc:15]'), noResolution);
    expect(result.warnings).toEqual([]);
  });
});

describe('applyInlineSyntax -- @Damage', () => {
  it('keeps the dice expression, including a nested damage-type bracket', () => {
    const result = applyInlineSyntax(
      paragraph('Deal @Damage[(1d8+4)[slashing]] damage.'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('Deal (1d8+4)[slashing] damage.');
  });

  it('handles multiple comma-separated damage terms', () => {
    const result = applyInlineSyntax(
      paragraph('@Damage[(1d8+4)[slashing],(1d4)[bleed]]'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('(1d8+4)[slashing],(1d4)[bleed]');
  });

  it('drops a trailing |options:... flag', () => {
    const result = applyInlineSyntax(
      paragraph('@Damage[2d6[fire]|options:area-damage]'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('2d6[fire]');
  });

  it('prefers an explicit {label} over the built dice text', () => {
    const result = applyInlineSyntax(
      paragraph('@Damage[1d6[fire]]{ouch!}'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('ouch!');
  });

  it('produces no warnings', () => {
    const result = applyInlineSyntax(paragraph('@Damage[1d6[fire]]'), noResolution);
    expect(result.warnings).toEqual([]);
  });
});

describe('applyInlineSyntax -- inline rolls [[/r ...]]', () => {
  it('strips the /r prefix and a trailing #flavor comment', () => {
    const result = applyInlineSyntax(
      paragraph('Roll [[/r 1d20+17 #Counteract]] to counteract.'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('Roll 1d20+17 to counteract.');
  });

  it('accepts a bare [[expression]] with no /r prefix', () => {
    const result = applyInlineSyntax(
      paragraph('Roll [[1d4]] bleed damage.'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('Roll 1d4 bleed damage.');
  });

  it('prefers an explicit {label}', () => {
    const result = applyInlineSyntax(
      paragraph('[[/r 1d20+5]]{Perception}'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('Perception');
  });

  it('produces no warnings', () => {
    const result = applyInlineSyntax(paragraph('[[/r 1d20+5]]'), noResolution);
    expect(result.warnings).toEqual([]);
  });
});

describe('applyInlineSyntax -- @Localize', () => {
  it('guesses a readable label from the last dot-segment, split at word boundaries', () => {
    const result = applyInlineSyntax(
      paragraph('See @Localize[PF2E.Trait.SomeLongTraitName] for details.'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('See Some Long Trait Name for details.');
  });

  it('always records a warning -- there is no localization table here', () => {
    const result = applyInlineSyntax(paragraph('@Localize[PF2E.Foo]'), noResolution);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('@Localize');
  });
});

describe('applyInlineSyntax -- unrecognized enrichers', () => {
  it('leaves the markup exactly as written, and warns', () => {
    const result = applyInlineSyntax(
      paragraph('@Actor[abc]{Name} did something.'),
      noResolution,
    );
    expect(textOf(result.richText)).toBe('@Actor[abc]{Name} did something.');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('@Actor[abc]{Name}');
  });

  it('is never dropped even with no trailing label', () => {
    const result = applyInlineSyntax(paragraph('@Scene[xyz] is nearby.'), noResolution);
    expect(textOf(result.richText)).toBe('@Scene[xyz] is nearby.');
  });
});

describe('applyInlineSyntax -- malformed markup never throws', () => {
  it('treats an unmatched opening bracket as literal text', () => {
    expect(() =>
      applyInlineSyntax(paragraph('@UUID[no closing bracket'), noResolution),
    ).not.toThrow();
    const result = applyInlineSyntax(paragraph('@UUID[no closing bracket'), noResolution);
    expect(textOf(result.richText)).toBe('@UUID[no closing bracket');
  });

  it('treats an unmatched [[ as literal text', () => {
    const result = applyInlineSyntax(paragraph('[[1d20 with no close'), noResolution);
    expect(textOf(result.richText)).toBe('[[1d20 with no close');
  });
});

describe('applyInlineSyntax -- nesting', () => {
  it('converts syntax inside a list item and inside strong/em', () => {
    const richText: RichText = [
      {
        kind: 'list',
        ordered: false,
        items: [
          [
            {
              kind: 'strong',
              children: [{ kind: 'text', value: 'Attempt a @Check[reflex|dc:20] save.' }],
            },
          ],
        ],
      },
    ];
    const result = applyInlineSyntax(richText, noResolution);
    expect(result.richText).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [
          [
            {
              kind: 'strong',
              children: [{ kind: 'text', value: 'Attempt a DC 20 Reflex save.' }],
            },
          ],
        ],
      },
    ]);
  });

  it('leaves an existing term node untouched', () => {
    const richText: RichText = [
      { kind: 'term', termKind: 'trait', slug: 'agile', label: 'agile' },
    ];
    const result = applyInlineSyntax(richText, noResolution);
    expect(result.richText).toEqual(richText);
  });
});

// Confirms the public UuidResolution/ResolveUuid types line up with what
// the per-entry mapper (the next PR) will actually supply.
describe('UuidResolution', () => {
  it('requires termKind, slug, and label', () => {
    const resolution: UuidResolution = {
      termKind: 'spell',
      slug: 'fireball',
      label: 'Fireball',
    };
    expect(resolution.termKind).toBe('spell');
  });
});
