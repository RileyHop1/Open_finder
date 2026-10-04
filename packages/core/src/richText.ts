/**
 * `RichText`: the one AST every piece of rendered rules text uses, whether
 * it was converted from upstream HTML at import time or written by us for
 * the reference book (ADR 0020, `docs/rules-reference.md`). A closed,
 * deliberately small set of node kinds -- nothing here is rendered with
 * `v-html`, so there is no HTML sanitization boundary anywhere downstream
 * of this schema, by construction.
 *
 * A `term` node is the one kind that is not plain markup: it is a link into
 * a tooltip (a condition, a trait, an action, a spell, or a feat). It always
 * carries its own display `label`, so a renderer never needs to resolve
 * anything just to show the words -- `slug` (with `termKind`, which says
 * which lookup to use) is only needed once the tooltip is actually opened,
 * and a term whose target turns out not to exist still reads correctly as
 * plain text with nothing broken.
 */

import { z } from 'zod';

export const TERM_KINDS = ['condition', 'trait', 'action', 'spell', 'feat'] as const;

export const termKindSchema = z.enum(TERM_KINDS);

export type TermKind = (typeof TERM_KINDS)[number];

/** `z.enum` only works on string literals, so this stays a plain `z.union` of number literals -- the same pattern `chatMessage.ts`'s `attackNumber` uses. */
const headingLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export type HeadingLevel = 1 | 2 | 3;

export type RichTextNode =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'strong'; readonly children: readonly RichTextNode[] }
  | { readonly kind: 'em'; readonly children: readonly RichTextNode[] }
  | { readonly kind: 'paragraph'; readonly children: readonly RichTextNode[] }
  | {
      readonly kind: 'heading';
      readonly level: HeadingLevel;
      readonly children: readonly RichTextNode[];
    }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly RichTextNode[])[];
    }
  | {
      readonly kind: 'term';
      readonly termKind: TermKind;
      readonly slug: string;
      readonly label: string;
    };

/**
 * Recursive, so this is `z.lazy` the same way `predicateSchema` is -- a
 * `paragraph`'s `children` (and a `list`'s `items`) can themselves contain
 * any node this schema accepts, `term` included. The `z.ZodType<RichTextNode>`
 * annotation makes this schema's inferred output fail to compile if it ever
 * stops structurally matching the hand-written type above.
 */
export const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text'), value: z.string() }),
    z.object({
      kind: z.literal('strong'),
      children: z.array(richTextNodeSchema).readonly(),
    }),
    z.object({
      kind: z.literal('em'),
      children: z.array(richTextNodeSchema).readonly(),
    }),
    z.object({
      kind: z.literal('paragraph'),
      children: z.array(richTextNodeSchema).readonly(),
    }),
    z.object({
      kind: z.literal('heading'),
      level: headingLevelSchema,
      children: z.array(richTextNodeSchema).readonly(),
    }),
    z.object({
      kind: z.literal('list'),
      ordered: z.boolean(),
      items: z.array(z.array(richTextNodeSchema).readonly()).readonly(),
    }),
    z.object({
      kind: z.literal('term'),
      termKind: termKindSchema,
      slug: z.string().min(1),
      label: z.string().min(1),
    }),
  ]),
);

/** A full piece of rules text: a sequence of top-level nodes (ordinarily `paragraph`/`heading`/`list`, though nothing here enforces that -- a bare `term` or `text` at the top level is valid too, e.g. a one-line condition summary with no paragraph wrapper). */
export const richTextSchema = z.array(richTextNodeSchema).readonly();

export type RichText = readonly RichTextNode[];
