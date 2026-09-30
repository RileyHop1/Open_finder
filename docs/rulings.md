# Rulings

Every rules judgment call this project makes, and why.

## Why this file exists
"The rules are handled for you" is the product's central promise, and PF2e has
interactions the community genuinely argues about. When we automate one of those,
we are picking a side. This file records which side and why, so that:

- the same argument is not re-litigated across three separate issues;
- a contributor changing rules math can see whether they are fixing a bug or
  reversing a deliberate decision;
- a GM who disagrees can find our reasoning and override it (see the GM override
  requirement in CLAUDE.md).

Scope is judgment calls only. Ordinary bugs — we implemented the rule wrong —
belong in the issue tracker, not here.

## Policy
See "Rulings and ambiguity" in CLAUDE.md. In short: automate the unambiguous
reading; where the rules are genuinely ambiguous, implement the most common
reading, make sure the GM can override it, record it here, and pin it with a
golden test.

## How to add an entry
One entry per judgment call, newest at the bottom. Keep the format:

```
### <Short name for the interaction>
- **Rules text:** what the books actually say, and where (book + section, no
  page-length quotations).
- **The ambiguity:** what is unclear, stated neutrally.
- **Our reading:** what we implemented.
- **Alternative reading:** the other credible interpretation, and who reads it
  that way.
- **Why:** the reason we chose ours. "Most common at tables" is a valid reason;
  say so if that is the reason.
- **Golden test:** the fixture that pins this behavior.
- **Override:** how a GM who disagrees gets the other result.
```

If an entry has no golden test, it is not settled — the test is what stops the
ruling from silently drifting.

## Entries

### Proficiency without level is not supported
- **Rules text:** Player Core's proficiency rules; the Remaster's default math
  adds a character's level to every proficiency rank at trained or above.
  Separately, the GM Core (and the pre-Remaster core rulebook before it)
  publishes an optional variant, Proficiency Without Level, which drops the
  level term entirely and rebalances DCs around flat rank bonuses instead.
- **The ambiguity:** not a rules ambiguity so much as a scope question --
  whether to support the variant rule at all, since some tables prefer its
  flatter math.
- **Our reading:** level-based proficiency only. `proficiencyModifier(rank,
  level)` (`systems/pf2e/src/rules/proficiency.ts`) adds level to the rank's
  own bonus for trained and above, and untrained is a flat `+0` -- never
  level, at any rank.
- **Alternative reading:** implement Proficiency Without Level as a togglable
  variant, the way some other VTTs do.
- **Why:** CLAUDE.md's Content scope section excludes variant rules by name
  (alongside Free Archetype and Dual-Class) precisely because supporting more
  than one build/math skeleton multiplies the surface area a solo maintainer
  has to test. This is that exclusion applied to the resolver.
- **Golden test:** `systems/pf2e/src/golden/fighter.test.ts` (the golden
  Fighter, E.2) exercises this function for real: its Fortitude, Reflex,
  Perception (Expert at level 1), Will, and Class DC (Trained) all resolve
  through `proficiencyModifier`, plus `proficiency.test.ts`'s own exact
  values for every rank at levels 1 and 20.
- **Override:** none needed at the table -- this is a build-time content
  scope decision, not a per-character automation result a GM would want to
  flip live. A table that wants Proficiency Without Level is not using the
  rule this project implements at all, the same way a table using Free
  Archetype is outside the wizard's one supported build skeleton.

### Duplicate upstream slugs
- **What happened:** running the importer against real upstream data for the
  first time (`ci/import-smoke`'s prep work) crashed on `writePacks`'s
  duplicate-slug check. Upstream carries a `bestiary-ability-glossary-srd`
  compendium that reprints common actions -- "Reactive Strike" is the one
  that surfaced this -- under the same name as the real `actions`
  compendium's own copy, purely so a creature stat block has something to
  link to for its rules text. A real-data survey found 112 same-type,
  same-name collisions across the dataset (`action`, `feat`, `npc`, and
  `hazard` entries), so this is systemic, not a one-off.
- **The ambiguity:** nothing in ADR 0003 or ADR 0012 says what should happen
  when two upstream entries legitimately collide on `(packId, slug)`. The
  importer's every other stage fails closed on bad *content*, but this
  isn't bad content -- both entries are valid, in-scope, ORC-licensed
  Remaster material that happen to share a name.
- **Our reading:** keep whichever entry sorts first by upstream file path
  (deterministic, since `reader.ts` already sorts that way before anything
  downstream sees it), and record every entry it beat as a dropped entry
  with reason `'duplicate-slug'` -- the same `DependencyDrop` shape (and the
  same coverage-report bucket) `resolveDependencies.ts` already produces,
  rather than inventing a second, parallel "why was this dropped" list.
  `writePacks.ts`'s module doc has the implementation.
- **Alternative reading:** hardcode a preference for the "real" compendium
  over known reference/glossary packs (`bestiary-ability-glossary-srd` and
  any future lookalikes). Rejected for now: it requires the importer to
  know upstream pack *names* are meaningful, which cuts against ADR 0004
  decision 3's "nothing outside the importer knows Foundry's format"
  principle more than a path-order tiebreak does, and the coverage report
  already surfaces every collision for a maintainer to review -- if
  path-order ever picks the wrong entry in practice, that is evidence for
  revisiting this, not a reason to guess a smarter rule now.
- **Why:** simple and deterministic beats clever and unverified. The
  coverage report turns "did the tiebreak matter" into an answerable
  question instead of a guess, the same way ADR 0004 decision 5 already
  treats the inert-element coverage report as evidence over guesswork.
- **Golden test:** `writePacks.test.ts`'s "duplicate slugs" suite, and
  `runImporter.test.ts`'s end-to-end duplicate-slug case. No golden
  *character* fixture is affected -- this is importer plumbing, not rules
  math.
- **Override:** none at the table -- this resolves at import time, long
  before a GM or player ever sees the content. A maintainer who disagrees
  with a specific collision's outcome re-pins after fixing it upstream-side
  or special-casing it in a mapper, the same as any other importer
  correction.
