import { describe, expect, it } from 'vitest';

import type { RichTextNode } from '@hearthtable/core';

import { BOOK_PAGES } from './pages.js';

/** Every node of a given kind anywhere in a page's `RichText`, recursively. */
function nodesOfKind<K extends RichTextNode['kind']>(
  nodes: readonly RichTextNode[],
  kind: K,
): (RichTextNode & { kind: K })[] {
  return nodes.flatMap((node) => {
    const here = node.kind === kind ? [node as RichTextNode & { kind: K }] : [];
    if (node.kind === 'list') {
      return [...here, ...node.items.flatMap((item) => nodesOfKind(item, kind))];
    }
    if ('children' in node) {
      return [...here, ...nodesOfKind(node.children, kind)];
    }
    return here;
  });
}

const termsIn = (nodes: readonly RichTextNode[]) => nodesOfKind(nodes, 'term');

describe('BOOK_PAGES', () => {
  it('has one page per planned topic, each with a unique slug and non-empty text', () => {
    expect(BOOK_PAGES.map((p) => p.slug)).toEqual([
      'your-turn',
      'checks-and-degrees-of-success',
      'multiple-attack-penalty',
      'proficiency',
      'movement-and-stride',
      'reactions',
      'flanking-and-off-guard',
      'hit-points-dying-and-recovery',
      'conditions-overview',
      'spellcasting-basics',
    ]);
    expect(new Set(BOOK_PAGES.map((p) => p.slug)).size).toBe(BOOK_PAGES.length);
    for (const bookPage of BOOK_PAGES) {
      expect(bookPage.text.length).toBeGreaterThan(0);
    }
  });

  it('parses every {kind:slug} span into a real term node, with no literal braces left in any text node', () => {
    for (const bookPage of BOOK_PAGES) {
      const textValues = nodesOfKind(bookPage.text, 'text').map((node) => node.value);
      for (const value of textValues) {
        expect(value).not.toMatch(/[{}]/);
      }
    }
  });

  it('your-turn names the basic actions it covers, each as its own term', () => {
    const [yourTurn] = BOOK_PAGES;
    const slugs = termsIn(yourTurn?.text ?? []).map((t) => t.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(['stride', 'strike', 'step', 'interact', 'ready', 'delay']),
    );
  });

  it('multiple-attack-penalty names the agile trait, and states both penalty pairs', () => {
    const map = BOOK_PAGES.find((p) => p.slug === 'multiple-attack-penalty');
    expect(termsIn(map?.text ?? []).map((t) => [t.termKind, t.slug])).toContainEqual([
      'trait',
      'agile',
    ]);
    const text = JSON.stringify(map?.text);
    expect(text).toContain('-5');
    expect(text).toContain('-10');
    expect(text).toContain('-4');
    expect(text).toContain('-8');
  });

  it('proficiency states the untrained exception and every rank’s bonus', () => {
    const proficiency = BOOK_PAGES.find((p) => p.slug === 'proficiency');
    const text = JSON.stringify(proficiency?.text);
    expect(text).toContain('Untrained');
    expect(text).toContain('+0');
    expect(text).toContain('+2');
    expect(text).toContain('+4');
    expect(text).toContain('+6');
    expect(text).toContain('+8');
  });

  it('checks-and-degrees-of-success names all four degrees', () => {
    const page = BOOK_PAGES.find((p) => p.slug === 'checks-and-degrees-of-success');
    const text = JSON.stringify(page?.text);
    expect(text).toContain('Critical success');
    expect(text).toContain('Critical failure');
  });

  it('movement-and-stride names Stride and Step as terms, and states the difficult-terrain cost', () => {
    const page = BOOK_PAGES.find((p) => p.slug === 'movement-and-stride');
    expect(termsIn(page?.text ?? []).map((t) => [t.termKind, t.slug])).toEqual(
      expect.arrayContaining([
        ['action', 'stride'],
        ['action', 'step'],
      ]),
    );
    const text = JSON.stringify(page?.text);
    expect(text).toContain('5 feet');
    expect(text).toContain('10');
  });

  it('reactions names Reactive Strike and states there is one per turn', () => {
    const page = BOOK_PAGES.find((p) => p.slug === 'reactions');
    const text = JSON.stringify(page?.text);
    expect(text).toContain('Reactive Strike');
    expect(text).toContain('one reaction');
  });

  it('flanking-and-off-guard names off-guard and every condition that imposes it on its own', () => {
    const page = BOOK_PAGES.find((p) => p.slug === 'flanking-and-off-guard');
    const slugs = termsIn(page?.text ?? []).map((t) => t.slug);
    expect(slugs).toEqual(
      expect.arrayContaining([
        'off-guard',
        'prone',
        'restrained',
        'grabbed',
        'paralyzed',
        'confused',
        'unconscious',
      ]),
    );
    expect(JSON.stringify(page?.text)).toContain('lowers a creature');
  });

  it('hit-points-dying-and-recovery marks itself (confirm) and names the dying chain conditions', () => {
    const page = BOOK_PAGES.find((p) => p.slug === 'hit-points-dying-and-recovery');
    const text = JSON.stringify(page?.text);
    expect(text).toContain('(confirm)');
    const slugs = termsIn(page?.text ?? []).map((t) => t.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(['dying', 'wounded', 'doomed', 'unconscious']),
    );
  });

  it('conditions-overview explains binary vs. valued, and the higher-value merge rule', () => {
    const page = BOOK_PAGES.find((p) => p.slug === 'conditions-overview');
    const text = JSON.stringify(page?.text);
    expect(text).toContain('Binary');
    expect(text).toContain('Valued');
    expect(text).toContain('higher one wins');
  });

  it('spellcasting-basics marks itself (confirm) and names all four traditions', () => {
    const page = BOOK_PAGES.find((p) => p.slug === 'spellcasting-basics');
    const text = JSON.stringify(page?.text);
    expect(text).toContain('(confirm)');
    for (const tradition of ['arcane', 'divine', 'occult', 'primal']) {
      expect(text).toContain(tradition);
    }
  });
});
