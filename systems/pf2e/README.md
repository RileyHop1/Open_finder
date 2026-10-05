# @hearthtable/pf2e

Pathfinder 2E as a plugin on top of the system-agnostic core — the same way
Foundry separates its core from a game system.

## What lives here
- **The rules engine** — statistics, proficiency, DCs, strikes, spellcasting
- **Rule elements** — our own schema and the v1 subset
  (`docs/adr/0004-rule-elements.md`)
- **The importer** (`src/importer/`) — converts upstream `foundryvtt/pf2e` JSON into
  our schemas, applying the license filter and the core-four-books scope filter
- **Sheets** — the PF2e-specific character and creature sheet logic
- **The reference book** (`src/book/`) — short pages written in our own
  words, parsed from a small Markdown subset into `RichText`
  (`docs/rules-reference.md`); unlike everything else here, never touches
  the importer or a compendium
- **Golden tests** — reference characters and our own invented creatures with
  hand-computed stats

## Content and licensing
**Never commit Paizo content to this repo.** The importer downloads pinned
upstream packs into `.data/upstream/` and writes converted output to
`.data/imported/`. Both are git-ignored, and CI independently fails if either
becomes tracked.

Read `docs/adr/0003-rules-data-licensing.md` and
`docs/adr/0006-content-scope-core-books.md` before touching the importer. Those
two filters are the mechanism enforcing the project's licensing position, not a
convenience.

## How it fits
Depends on `@hearthtable/core` and `@hearthtable/dice`. Nothing in `core` may
depend on this package.

**The rules code runs in the browser too** (the sheet calls `prepareCharacter`), so
anything outside `src/importer/` must import dice from `@hearthtable/dice/pure`,
not the package root: the root also exports `cryptoRandomSource`, which needs
`node:crypto`. The importer is Node-only and is not exported from `src/index.ts`.
