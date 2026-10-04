# 0020. Rules text: our own AST, converted at import time

- **Status:** Accepted
- **Date:** 2026-10-04
- **Depends on:** ADR 0003 (rules data licensing), ADR 0011 (importer pipeline)

## Context
Milestone 6 ("Learn as you play") needs rules text on screen: a condition's
tooltip, a spell's or feat's description, a trait's one-line meaning. The
importer already keeps every entry's `description`, but as raw upstream HTML
(`nestedStringField(system, 'description', 'value')`), with Foundry's own
inline reference syntax left untouched inside it: `@UUID[...]`, `@Check[...]`,
`[[/r ...]]`, `@Damage[...]`, `@Localize[...]`. None of that is renderable as
written -- it is Foundry's own module system's syntax for things this project
does not have (a compendium link resolved at render time, a rollable inline
check), and `resolveDependencies.ts` already explicitly declines to resolve
`@UUID` links in prose (comment at lines 21-28), so today's `description` is
not fit to show a player.

Two things have to happen before this text is screen-ready: the HTML has to
become something Vue can render without `v-html`, and the inline syntax has to
become plain words or a link into something we actually have.

**Where trait text comes from is a separate, harder question.** Traits
(`agile`, `finesse`, `concentrate`, ...) are bare slugs everywhere in this
project (`traitSlugSchema`, `systems/pf2e/src/content/common.ts`) -- no
description for any of them exists anywhere, because upstream's compendium
packs don't carry one. Upstream keeps trait text in `static/lang/en.json`
instead, under keys like `PF2E.TraitDescriptionAgile`, and that file is not
filtered by source book the way `packs/` is: it is one flat list covering
every trait in every book upstream supports, Remaster and legacy alike. ADR
0003's filter operates on *entries*, each carrying its own `Provenance`; a
trait's rule text has no publication attached to filter by at all.

In practice this is less alarming than it sounds, for one reason specific to
traits: a trait's *mechanical* definition doesn't change across printings.
"Agile" reduces the Multiple Attack Penalty; that sentence is the same whether
the weapon carrying it is from Player Core or a legacy book. Trait text is
rules mechanics, not narrative content, and the actual traits that will ever
need a tooltip here are exactly the ones used by entries ADR 0003's filter
already let through -- i.e., ones a Remaster book also defines and uses.

## Decision
1. **Every entry gets a second field, `text: RichText`, alongside the existing
   `description: string`.** `description` is untouched -- changing its type
   would ripple through roughly a hundred existing fixtures across the
   importer and golden tests for no benefit, since nothing currently reads it
   as anything but an opaque string. `text` is the new, renderable value;
   nothing in this project will read `description` once the UI lands. `text`
   is optional, not defaulted to `[]` -- a defaulted field is *required* in
   the schema's inferred TypeScript type (always present once parsed), which
   would force every one of this project's own hand-built fixtures (golden
   characters, rule-engine test entries) to add a field they have no content
   for. Optional keeps the same fixtures valid unchanged, and "absent" reads
   correctly either way: nothing to show yet.
2. **`RichText` is our own small AST, not sanitized HTML.** A short, closed set
   of node kinds -- paragraph, heading, list, strong, em, plain text, and a
   `term` node (`{ kind, slug, label }`) for anything that should be a tooltip
   link. `packages/core` defines the schema; nothing renders it with `v-html`
   anywhere, so there is no HTML sanitization boundary to get wrong in this
   project at all.
3. **Conversion happens once, at import time, inside the importer.** The
   importer parses upstream's HTML and inline syntax into `RichText` before
   writing the entry to `.data/imported/`. The client never parses HTML; it
   only ever walks an AST it already trusts, because the importer already
   validated it against the Zod schema on the way out.
4. **Inline syntax degrades to plain text or a term, never to an error.**
   `@UUID[...]` becomes a `term` node when the target is something this
   project actually imported (so it can resolve to a tooltip or a page), and
   a plain-text label otherwise -- consistent with `resolveDependencies.ts`
   already treating unresolved links as display-only, not as something that
   changes what an entry *does*. `@Check`, `[[/r ...]]`, and `@Damage` become
   plain text ("DC 20 Reflex", a dice expression). Anything the converter does
   not recognize becomes plain text too, with a count in the coverage report
   (the same report ADR 0004's rule-element mapper already produces one of) --
   never a thrown error, because a judgment call about one piece of flavor
   text in one entry must never block the whole import.
5. **Trait text is imported, scoped to traits already in use.** `static/lang`
   is added to the sparse checkout alongside `packs/`, under its own pinned
   checksum (`UPSTREAM_LANG_CHECKSUM`, independent of `UPSTREAM_PACKS_CHECKSUM`
   -- see the ADR 0011 amendment below). The importer writes a trait glossary
   containing **only traits referenced by at least one already-filtered,
   already-imported entry** -- never the full upstream list. This is the
   mitigation for the licensing question above: every trait that reaches a
   player is one this project is already allowed to say exists, because a
   Remaster entry already uses it.
6. **If this reasoning doesn't hold up on a later, non-hobby review, the
   fallback is cheap: drop the trait glossary and show the bare trait name.**
   Nothing else in this decision depends on trait text existing -- conditions,
   actions, spells, and feats all get their text from the already-licensed
   `packs/` pipeline, unaffected.

## Consequences
- **No HTML sanitizer dependency, ever.** Converting at import time and
  rendering an AST means this project never needs `DOMPurify` or similar, and
  never has an XSS surface from rules text to defend.
- **The importer takes on an HTML parser** (`htmlparser2`, pure JS). It runs
  only inside `systems/pf2e/src/importer`, which executes as a server-spawned
  child process (`apps/server/src/contentImport.ts`) and is never part of the
  client bundle, so this doesn't touch ADR 0009 or ADR 0010's distribution
  constraints.
- **A second checksum to maintain.** Re-pinning upstream now means updating
  two checksums, not one, whenever `static/lang/en.json` changes alongside
  `packs/`. This is a small, mechanical addition to an already-reviewed
  re-pin process (ADR 0011).
- **Re-importing is required before this milestone's UI shows real text.**
  `text` is simply absent on any entry imported before this ADR's PRs land,
  which the renderer treats the same as "nothing to show."
- **This ADR's trait-licensing call is this project's own judgment, not legal
  advice** -- same caveat ADR 0003 already carries, and the same obligation:
  revisit before the project is shared publicly.

## Alternatives considered
### Store sanitized HTML and render with `v-html`
The least new code: convert nothing, sanitize upstream's HTML with a library
like DOMPurify, and let the browser render it directly. Rejected because it
permanently couples this project to a sanitizer's correctness for every piece
of displayed rules text, forever, for a problem an AST sidesteps entirely by
construction -- there is no markup to sanitize if nothing is ever markup.

### Convert at read time, not at import time
Keep `description` as raw HTML in storage and run the HTML-to-AST conversion
in the server (or client) on every request instead of once at import. Rejected:
it repeats the same parse on every page load instead of once per re-import,
for a value that is write-once and read-many, and it means the importer's
pinned-and-reviewed output is no longer the actual thing players see --
rendering becomes one more place the licensing-critical conversion logic has
to live and be kept correct.

### Skip trait text entirely for milestone 6
Avoids the licensing question outright. Rejected by the user's explicit
decision for this milestone, but recorded as the fallback in Decision point 6
if the reasoning in Decision point 5 does not hold up on a stricter review.
