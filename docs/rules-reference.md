# Rules reference and tooltips

Milestone 6, "learn as you play" (CLAUDE.md's Player experience section): a
rules term shows its text on hover or tap wherever it appears, and a short
reference book covers the mechanics a new player needs that no single
compendium entry explains on its own (the three actions, degrees of success,
flanking). See [adr/0020-rules-text.md](adr/0020-rules-text.md) for why rules
text is converted to our own AST at import time instead of rendered as HTML.

This page specifies the shape everything in this system shares, not the
component code -- that is specified PR by PR as it lands (see milestone 6's
tracking issue). Grows as milestone 6 does, the same way `docs/combat.md` did
for milestone 5.

## Three sources, one shape
Every piece of rules text a player sees -- a condition's tooltip, a spell's
description, a trait's one-liner, a reference book page -- is a `RichText`
value: the same small AST, regardless of where it came from.

| Source | Where it's written | Committed? |
| --- | --- | --- |
| Condition / action / spell / feat text | Converted from upstream HTML, at import time | No -- lives in `.data/imported/`, per ADR 0003 |
| Trait text | Converted from upstream's `static/lang/en.json`, at import time | No, same reason |
| Reference book pages | Written by us, in our own words | Yes -- plain files in `systems/pf2e` |

A book page and an imported entry's description render through the exact
same `RulesText` component and can both contain a `term` node that opens the
exact same tooltip. The player never needs to know which kind of text they're
reading.

Trait text's own importer step (`traitGlossary.ts`) writes a single
`traits.json` -- a plain array of `{ slug, name, text }`, not a pack
directory -- holding **only the traits an already-kept entry actually
carries**, built from a slug-to-lang-key heuristic that doesn't resolve
every real trait slug (a miss just means a bare-name tooltip, never a
broken one). See `docs/importer.md`'s "The trait glossary" section for how
the heuristic works and why.

## `RichText`
Defined in `packages/core` (`packages/core/src/richText.ts`, landing with the
PR that adds it). A `RichText` is `readonly RichTextNode[]`, where a node is
one of:

```ts
{ kind: 'paragraph'; children: RichTextNode[] }
{ kind: 'heading'; level: 1 | 2 | 3; children: RichTextNode[] }
{ kind: 'list'; ordered: boolean; items: RichTextNode[][] }
{ kind: 'strong'; children: RichTextNode[] }
{ kind: 'em'; children: RichTextNode[] }
{ kind: 'text'; value: string }
{ kind: 'term'; termKind: 'condition' | 'trait' | 'action' | 'spell' | 'feat'; slug: string; label: string }
```

A `term` node always carries its own display `label`, so the renderer never
needs to look anything up just to show the words -- `slug` (plus `termKind`,
which names the lookup, e.g. the pack id) is only needed when the tooltip is
actually opened. This is also why a `term` degrades safely: if the target
turns out not to exist by the time it's opened, the label alone still reads
correctly as plain text.

No other node kinds exist. Anything upstream's HTML or inline syntax does not
map onto one of these becomes plain `text`, per ADR 0020 point 4 -- never
dropped, never an import failure.

## Tooltips (`RulesTerm`)
One component renders every `term` node, regardless of `termKind`. It:
- opens on hover, on keyboard focus, and on tap (not hover-only -- consistent
  with `ChatRollCard.vue`'s existing preference for a disclosure that works
  without a mouse);
- closes on `Escape`, one level at a time;
- **nests.** A `term` node can appear inside the `RichText` shown by another
  open tooltip (e.g. a condition's own text mentions a trait), and opening it
  stacks a second tooltip rather than replacing the first;
- meets the 44px touch target minimum (`--touch-target-min`,
  CLAUDE.md's Accessibility section) on every open/close control, since this
  is one of the interactions a player on a tablet uses constantly.

## The reference book
Short pages, written by us, in our own words -- never upstream's text, so
nothing about them is licensing-sensitive. Each page is a plain Markdown
subset (paragraphs, headings, lists, bold/italic) parsed into the same
`RichText` shape the importer produces, plus one piece of page-only syntax:

```
{condition:frightened}
```

`{kind:slug}` becomes a `term` node with that `kind` and `slug`. Its `label`
is the slug, title-cased (`take-cover` -> `Take Cover`) -- not a live
compendium lookup, so a page parses with no network or import dependency at
all, which is exactly "works without any import" from the decision above.
This matches a real term's actual display name in practice, since every
slug in this project already *is* its display name in kebab-case. This
syntax deliberately does
not look like Foundry's own `@UUID[...]` / `[[/r ...]]` -- a book page is
never confused for upstream content, and it needs none of the escaping those
forms exist for.

### Planned pages
Written in our own words, each checked against
<https://2e.aonprd.com> and marked **(confirm)** wherever it couldn't be:
- Your turn and the three actions
- Checks and degrees of success
- Multiple Attack Penalty
- Proficiency
- Movement and Stride
- Reactions
- Flanking and off-guard
- Hit points, dying, and recovery
- Conditions, an overview
- Spellcasting basics

## The Rules drawer
A third drawer in `TableView.vue` (alongside the scene and sheet drawers,
built on the same `useDrawer.ts`), opened by a "Rules" button or the `?`
hotkey (ignored while focus is in a text input, so it never fires while
typing in chat). It shows the book's table of contents, and one search box
that covers book pages, compendium entry names (the existing
`/api/compendium/search`), and trait names. This drawer is milestone 6's
encyclopedia from CLAUDE.md's north star.

## Testing
- `richText.test.ts` (`packages/core`): the schema accepts every node kind and
  rejects an unknown one.
- Importer: hand-authored HTML fixtures exercise the converter -- one test per
  inline syntax form, one for an unresolved `@UUID`, one for unrecognized
  markup falling back to plain text, never against real upstream content
  (ADR 0013's hermetic-tests rule applies here the same as everywhere else).
- Trait glossary (`traitGlossary.test.ts`): the slug-to-lang-key heuristic
  against hand-authored `en.json` fixtures, a miss counted rather than
  thrown, and deduplication/sorting -- the real `en.json` is never fetched
  by a test, only by a real import run.
- Book page parser: a fixture page per Markdown construct, plus one exercising
  `{kind:slug}`.
- Component tests (`RulesTerm.test.ts`, `RulesText.test.ts`): opens on
  hover/focus/tap, closes on Escape, a nested term opens its own tooltip
  without closing the first.
- Playwright: hover a condition chip, open a nested term inside it, dismiss
  both with Escape; open the drawer with `?` and find a page, an entry, and a
  trait from one search box.
