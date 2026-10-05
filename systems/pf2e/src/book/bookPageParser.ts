/**
 * The reference book's own page format (ADR 0020, `docs/rules-reference.md`):
 * a small Markdown subset, parsed into the exact same `RichText` AST the
 * importer produces from upstream HTML. A book page and an imported entry's
 * description render through the one `RulesText` component either way.
 *
 * **Supported syntax, and nothing else:**
 * - Paragraphs, separated by a blank line.
 * - `#`, `##`, `###` headings (level 1-3; one line each).
 * - A list block: every line in the block starts with `- ` (unordered) or
 *   `1. `/`2. `/... (ordered). A block that isn't uniformly one or the
 *   other is just a paragraph -- never a thrown error over one malformed line.
 * - `**bold**` and `_italic_` inline.
 * - `{kind:slug}` -- a term node, e.g. `{condition:frightened}`. Unlike the
 *   importer's `@UUID`, this is never ambiguous about what it names: this
 *   project's own slugs are already stable, so there is no upstream link to
 *   resolve. `kind` must be one of `TERM_KINDS`; anything else degrades to
 *   plain text rather than failing the page.
 *
 * **The label is the slug, title-cased -- never a live compendium lookup.**
 * A book page parses with no network or import dependency at all, the same
 * "works without any import" property the reference book was chosen for in
 * the first place. This matches a real term's actual display name in
 * practice, since every slug in this project already *is* its display name
 * in kebab-case.
 *
 * Deliberately not CommonMark: no nested emphasis, no links, no inline code,
 * no tables. A book page is short, hand-written prose, not an arbitrary
 * document -- the subset is exactly what milestone 6's planned pages need.
 */

import type { RichText, RichTextNode, TermKind } from '@hearthtable/core';
import { TERM_KINDS } from '@hearthtable/core';

const TERM_KIND_SET: ReadonlySet<string> = new Set(TERM_KINDS);

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function isTermKind(value: string): value is TermKind {
  return TERM_KIND_SET.has(value);
}

/** The next inline trigger (`**`, `_`, `{`) at or after `from`, whichever comes first. */
function findNextTrigger(
  text: string,
  from: number,
): { index: number; trigger: '**' | '_' | '{' } | undefined {
  let best: { index: number; trigger: '**' | '_' | '{' } | undefined;
  for (const trigger of ['**', '_', '{'] as const) {
    const index = text.indexOf(trigger, from);
    if (index !== -1 && (best === undefined || index < best.index)) {
      best = { index, trigger };
    }
  }
  return best;
}

/** `{condition:frightened}` -> a term node, or `undefined` if the braces don't hold a well-formed `kind:slug` pair. */
function parseTerm(inner: string): RichTextNode | undefined {
  const colon = inner.indexOf(':');
  if (colon === -1) {
    return undefined;
  }
  const kind = inner.slice(0, colon).trim();
  const slug = inner.slice(colon + 1).trim();
  if (!isTermKind(kind) || slug === '') {
    return undefined;
  }
  return { kind: 'term', termKind: kind, slug, label: titleCaseSlug(slug) };
}

/** Parses inline spans (bold, italic, terms) within one block of text, degrading an unmatched delimiter to literal text rather than throwing. */
export function parseInline(text: string): RichTextNode[] {
  const nodes: RichTextNode[] = [];
  let plain = '';
  let pos = 0;

  function flushPlain(): void {
    if (plain !== '') {
      nodes.push({ kind: 'text', value: plain });
      plain = '';
    }
  }

  while (pos < text.length) {
    const next = findNextTrigger(text, pos);
    if (next === undefined) {
      plain += text.slice(pos);
      break;
    }
    plain += text.slice(pos, next.index);

    if (next.trigger === '{') {
      const close = text.indexOf('}', next.index + 1);
      const term =
        close === -1 ? undefined : parseTerm(text.slice(next.index + 1, close));
      if (term === undefined) {
        plain += text[next.index];
        pos = next.index + 1;
      } else {
        flushPlain();
        nodes.push(term);
        pos = close + 1;
      }
      continue;
    }

    const delimiter = next.trigger;
    const close = text.indexOf(delimiter, next.index + delimiter.length);
    if (close === -1) {
      plain += delimiter;
      pos = next.index + delimiter.length;
      continue;
    }
    flushPlain();
    const inner = text.slice(next.index + delimiter.length, close);
    nodes.push({
      kind: delimiter === '**' ? 'strong' : 'em',
      children: parseInline(inner),
    });
    pos = close + delimiter.length;
  }

  flushPlain();
  return nodes;
}

const HEADING_PATTERN = /^(#{1,3})\s+(.+)$/;
const UNORDERED_ITEM_PATTERN = /^-\s+(.*)$/;
const ORDERED_ITEM_PATTERN = /^\d+\.\s+(.*)$/;

function parseList(
  lines: readonly string[],
  itemPattern: RegExp,
  ordered: boolean,
): RichTextNode | undefined {
  const items: string[] = [];
  for (const line of lines) {
    const match = itemPattern.exec(line);
    if (match === null) {
      return undefined;
    }
    items.push(match[1] ?? '');
  }
  return { kind: 'list', ordered, items: items.map((item) => parseInline(item)) };
}

function parseBlock(block: string): RichTextNode {
  const lines = block.split('\n').map((line) => line.trim());

  if (lines.length === 1) {
    const heading = HEADING_PATTERN.exec(lines[0] ?? '');
    if (heading !== null) {
      const level = Math.min(heading[1]?.length ?? 1, 3) as 1 | 2 | 3;
      return { kind: 'heading', level, children: parseInline(heading[2] ?? '') };
    }
  }

  const unordered = parseList(lines, UNORDERED_ITEM_PATTERN, false);
  if (unordered !== undefined) {
    return unordered;
  }
  const ordered = parseList(lines, ORDERED_ITEM_PATTERN, true);
  if (ordered !== undefined) {
    return ordered;
  }

  return { kind: 'paragraph', children: parseInline(lines.join(' ')) };
}

/** Parses a whole page's Markdown subset into `RichText`: every blank-line-separated block becomes one paragraph, heading, or list node. */
export function parseBookPage(markdown: string): RichText {
  return markdown
    .trim()
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map(parseBlock);
}
