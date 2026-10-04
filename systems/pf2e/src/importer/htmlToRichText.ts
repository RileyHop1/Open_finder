/**
 * Converts upstream's rules-text HTML into a `RichText` AST (ADR 0020). This
 * module handles HTML *structure* -- paragraphs, headings, lists,
 * bold/italic, line breaks, and the two degenerate cases upstream's markup
 * occasionally contains, a table and an action-cost icon span. Foundry's
 * inline reference syntax (`@UUID[...]`, `@Check[...]`, `[[/r ...]]`) lives
 * inside the text nodes this module produces and is untouched here -- that
 * is `inlineSyntax.ts`'s job (the next PR in this stack), kept separate so
 * each piece is reviewable on its own.
 *
 * Built on `htmlparser2`'s streaming `Parser`, not a DOM: this project has
 * no DOM at import time (it runs as a Node child process), and a streaming
 * parser is also the smallest possible dependency for a one-directional,
 * read-only conversion. A small explicit stack of `Frame`s stands in for
 * the DOM tree a browser would give for free.
 *
 * **What a tag becomes, and why:**
 * - `p`, `h1`-`h6` (`h4`-`h6` clamp to level 3, `RichText`'s ceiling),
 *   `ul`/`ol`/`li`, `strong`/`b`, `em`/`i` map onto their matching node kind.
 * - `br` becomes a literal `\n` in the surrounding text, not a node kind of
 *   its own -- `RichText` has no line-break node, and a newline inside a
 *   `text` node's `value` is a simpler, equally faithful rendering.
 * - **A `table` degrades to a `list`, one item per row**, each item's cells
 *   joined with `" | "`. `RichText` has no table node (nothing in v1's
 *   scope needs one, and the few tables that do turn up in a condition's or
 *   a hazard's description are short enough that this reads fine as a
 *   list). Losing column headers is an accepted simplification, not a bug.
 * - **`<span class="action-glyph">` is dropped whole, text included.**
 *   Upstream renders an action's cost as a private-use-area codepoint in an
 *   icon font this project doesn't ship; keeping that codepoint as plain
 *   text would show literal tofu. Action cost is already shown elsewhere
 *   (the action bar's own ◆ icons, `basicActions.ts`), so nothing is lost
 *   by dropping it here.
 * - Anything else unrecognized (`div`, `a`, `hr`, `img`, a `span` with no
 *   `action-glyph` class, ...) is **transparent**: its own children are
 *   kept, flattened into its parent, with no node of its own. This is the
 *   safe default for a tag this module doesn't specifically understand --
 *   content survives, structure that has no `RichText` equivalent just
 *   doesn't get invented one.
 */

import { Parser } from 'htmlparser2';

import type { HeadingLevel, RichText, RichTextNode } from '@hearthtable/core';

interface GenericFrame {
  readonly kind: 'root' | 'paragraph' | 'heading' | 'strong' | 'em' | 'transparent';
  readonly level?: HeadingLevel;
  readonly children: RichTextNode[];
}

interface ListFrame {
  readonly kind: 'list';
  readonly ordered: boolean;
  readonly items: RichTextNode[][];
}

interface ListItemFrame {
  readonly kind: 'listItem';
  readonly children: RichTextNode[];
}

interface TableCellFrame {
  readonly kind: 'tableCell';
  readonly children: RichTextNode[];
}

/** Swallows everything inside it (its own children included) -- `action-glyph` spans only. */
interface SkipFrame {
  readonly kind: 'skip';
}

/** A one-shot marker: `<br>` has no content of its own, just the effect `closeFrame` gives it (a literal newline in the surrounding text). */
interface BreakFrame {
  readonly kind: 'br';
}

type Frame =
  GenericFrame | ListFrame | ListItemFrame | TableCellFrame | SkipFrame | BreakFrame;

const HEADING_TAGS: Readonly<Record<string, HeadingLevel>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 3,
  h5: 3,
  h6: 3,
};

/** The frame kinds `append` can actually push a child node into -- everything except `list` (children only arrive via a `listItem`), `skip`, and `br` (both childless by design). */
function hasChildren(
  frame: Frame,
): frame is GenericFrame | ListItemFrame | TableCellFrame {
  return frame.kind !== 'list' && frame.kind !== 'skip' && frame.kind !== 'br';
}

/** Appends `node` to the frame on top of the stack, merging into a trailing text node when both are text -- so a run of entities/inline tags doesn't fragment into many one-character text nodes. */
function append(stack: readonly Frame[], node: RichTextNode): void {
  const top = stack[stack.length - 1];
  if (top === undefined || !hasChildren(top)) {
    return;
  }
  const { children } = top;
  const last = children[children.length - 1];
  if (node.kind === 'text' && last?.kind === 'text') {
    children[children.length - 1] = { kind: 'text', value: last.value + node.value };
    return;
  }
  children.push(node);
}

function appendText(stack: readonly Frame[], raw: string): void {
  const collapsed = raw.replace(/\s+/g, ' ');
  if (collapsed === '') {
    return;
  }
  const top = stack[stack.length - 1];
  // Drop whitespace-only text that would otherwise open a frame with a
  // leading space (pretty-printed HTML's indentation, mainly).
  if (
    collapsed === ' ' &&
    (top === undefined || !hasChildren(top) || top.children.length === 0)
  ) {
    return;
  }
  append(stack, { kind: 'text', value: collapsed });
}

function openTag(
  stack: Frame[],
  tagName: string,
  attribs: Readonly<Record<string, string>>,
): void {
  const name = tagName.toLowerCase();
  const headingLevel = HEADING_TAGS[name];
  if (name === 'p') {
    stack.push({ kind: 'paragraph', children: [] });
  } else if (headingLevel !== undefined) {
    stack.push({ kind: 'heading', level: headingLevel, children: [] });
  } else if (name === 'ul') {
    stack.push({ kind: 'list', ordered: false, items: [] });
  } else if (name === 'ol') {
    stack.push({ kind: 'list', ordered: true, items: [] });
  } else if (name === 'li') {
    stack.push({ kind: 'listItem', children: [] });
  } else if (name === 'strong' || name === 'b') {
    stack.push({ kind: 'strong', children: [] });
  } else if (name === 'em' || name === 'i') {
    stack.push({ kind: 'em', children: [] });
  } else if (name === 'table') {
    stack.push({ kind: 'list', ordered: false, items: [] });
  } else if (name === 'tr') {
    stack.push({ kind: 'listItem', children: [] });
  } else if (name === 'td' || name === 'th') {
    stack.push({ kind: 'tableCell', children: [] });
  } else if (name === 'br') {
    stack.push({ kind: 'br' });
  } else if (
    name === 'span' &&
    (attribs.class ?? '').split(/\s+/).includes('action-glyph')
  ) {
    stack.push({ kind: 'skip' });
  } else {
    stack.push({ kind: 'transparent', children: [] });
  }
}

/**
 * Trims a single leading/trailing space off a node list -- the collapsed
 * whitespace `appendText` leaves at a tag's inner edge (`<p> Text </p>`'s
 * leading and trailing space, mainly). Whitespace *between* sibling nodes
 * is never touched; only the very first and last node, and only when it's
 * text, are affected.
 */
function trimEdges(children: readonly RichTextNode[]): RichTextNode[] {
  let result = [...children];
  const first = result[0];
  if (first?.kind === 'text') {
    const trimmed = first.value.replace(/^ /, '');
    result =
      trimmed === ''
        ? result.slice(1)
        : [{ kind: 'text', value: trimmed }, ...result.slice(1)];
  }
  const last = result[result.length - 1];
  if (last?.kind === 'text') {
    const trimmed = last.value.replace(/ $/, '');
    result =
      trimmed === ''
        ? result.slice(0, -1)
        : [...result.slice(0, -1), { kind: 'text', value: trimmed }];
  }
  return result;
}

function closeFrame(stack: Frame[]): void {
  const frame = stack.pop();
  // The document's real root frame is pushed once, outside this function,
  // and never closed -- there is no tag whose close event would pop it.
  if (frame === undefined || frame.kind === 'root') {
    return;
  }
  switch (frame.kind) {
    case 'skip':
      return;
    case 'br':
      append(stack, { kind: 'text', value: '\n' });
      return;
    case 'paragraph':
      append(stack, { kind: 'paragraph', children: trimEdges(frame.children) });
      return;
    case 'heading':
      append(stack, {
        kind: 'heading',
        level: frame.level ?? 3,
        children: trimEdges(frame.children),
      });
      return;
    case 'strong':
      append(stack, { kind: 'strong', children: trimEdges(frame.children) });
      return;
    case 'em':
      append(stack, { kind: 'em', children: trimEdges(frame.children) });
      return;
    case 'transparent':
      for (const child of trimEdges(frame.children)) {
        append(stack, child);
      }
      return;
    case 'list':
      append(stack, { kind: 'list', ordered: frame.ordered, items: frame.items });
      return;
    case 'listItem': {
      const parent = stack[stack.length - 1];
      if (parent?.kind === 'list') {
        parent.items.push(trimEdges(frame.children));
      } else {
        // A stray <li>/<tr> outside any <ul>/<ol>/<table> (malformed
        // upstream markup) -- its content still isn't lost.
        for (const child of trimEdges(frame.children)) {
          append(stack, child);
        }
      }
      return;
    }
    case 'tableCell': {
      const parent = stack[stack.length - 1];
      if (parent !== undefined && hasChildren(parent) && parent.children.length > 0) {
        append(stack, { kind: 'text', value: ' | ' });
      }
      for (const child of trimEdges(frame.children)) {
        append(stack, child);
      }
      return;
    }
  }
}

/**
 * Converts one piece of upstream HTML into `RichText`. Never throws: an
 * `htmlparser2` parse error still yields whatever was parsed up to that
 * point, consistent with ADR 0020 point 4's "degrades, never errors" --
 * one malformed description must not fail the whole import run.
 */
export function htmlToRichText(html: string): RichText {
  const root: GenericFrame = { kind: 'root', children: [] };
  const stack: Frame[] = [root];
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        openTag(stack, name, attribs);
      },
      ontext(text) {
        appendText(stack, text);
      },
      onclosetag() {
        closeFrame(stack);
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return trimEdges(root.children);
}
