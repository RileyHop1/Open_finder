/**
 * Converts upstream's rules-text HTML into a `RichText` AST (ADR 0020). This
 * module handles the common HTML *structure* -- paragraphs, headings,
 * lists, bold/italic, line breaks. Two things it deliberately does not
 * cover yet, each its own small follow-up PR: Foundry's inline reference
 * syntax (`@UUID[...]`, `@Check[...]`, `[[/r ...]]`), which lives inside the
 * text nodes this module produces and is untouched here; and the two
 * degenerate cases upstream's markup occasionally contains, a `<table>` and
 * an action-cost icon span -- rare enough, and separable enough, that they
 * don't belong in the same PR as the common case.
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
 * - Anything else unrecognized (`div`, `a`, `hr`, `img`, `table`, `span`,
 *   ...) is **transparent**: its own children are kept, flattened into its
 *   parent, with no node of its own. This is the safe default for a tag
 *   this module doesn't specifically understand -- content survives,
 *   structure that has no `RichText` equivalent just doesn't get invented
 *   one. `table` and `span.action-glyph` get a real mapping of their own in
 *   the next PR; until then, a table's cell and row text still comes
 *   through (just run together), and an action-glyph span's icon-font
 *   codepoint still shows as literal text -- both are strictly worse
 *   *fidelity*, never lost *content*, which is the right place for this
 *   module to be mid-stack.
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

/** A one-shot marker: `<br>` has no content of its own, just the effect `closeFrame` gives it (a literal newline in the surrounding text). */
interface BreakFrame {
  readonly kind: 'br';
}

type Frame = GenericFrame | ListFrame | ListItemFrame | BreakFrame;

const HEADING_TAGS: Readonly<Record<string, HeadingLevel>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 3,
  h5: 3,
  h6: 3,
};

/** The frame kinds `append` can actually push a child node into -- everything except `list` (children only arrive via a `listItem`) and `br` (childless by design). */
function hasChildren(frame: Frame): frame is GenericFrame | ListItemFrame {
  return frame.kind !== 'list' && frame.kind !== 'br';
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

function openTag(stack: Frame[], tagName: string): void {
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
  } else if (name === 'br') {
    stack.push({ kind: 'br' });
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
        // A stray <li> outside any <ul>/<ol> (malformed upstream markup) --
        // its content still isn't lost.
        for (const child of trimEdges(frame.children)) {
          append(stack, child);
        }
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
      onopentag(name) {
        openTag(stack, name);
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
