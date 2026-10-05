# The importer

Converts upstream `foundryvtt/pf2e` JSON into our own Zod-validated
compendium entries (`docs/compendium.md`). Licensing-critical -- read
[adr/0003-rules-data-licensing.md](adr/0003-rules-data-licensing.md) and
[adr/0006-content-scope-core-books.md](adr/0006-content-scope-core-books.md)
before touching it. Lives at `systems/pf2e/src/importer/`.

This page covers the full pipeline: fetch, verify, read, both filters, the
rule-element mapper, every per-kind content mapper, dependency resolution,
the writer, the coverage report, and the CLI that wires all of it together
(`pnpm --filter @hearthtable/pf2e run import`). Stack D (rules math) and Stack E
(the golden test set), which consume what this produces, are documented
elsewhere.

## The pin

`systems/pf2e/src/importer/upstream.ts` names exactly what this importer
targets:

```ts
UPSTREAM_REPO = 'https://github.com/foundryvtt/pf2e.git'
UPSTREAM_COMMIT = '<40-character SHA>'
UPSTREAM_PACKS_CHECKSUM = 'sha256:<64 hex characters>'
UPSTREAM_LANG_CHECKSUM = 'sha256:<64 hex characters>'
```

Per [adr/0011-importer-pipeline.md](adr/0011-importer-pipeline.md), both the
commit and the checksum matter: the commit says *which* upstream state to
fetch, and the checksum independently verifies *what actually arrived* --
catching the case where a ref moved (force-push, deletion) and a fetch by
SHA would otherwise pull different bytes without any diff in this repo.
`UPSTREAM_LANG_CHECKSUM` is the same idea for a second, independent file --
`static/lang/en.json`, which [adr/0020-rules-text.md](adr/0020-rules-text.md)
added as the source for the trait glossary (below). It is optional on
`RunImporterOptions.upstream`: a caller that omits it (every hermetic test
but the trait-glossary ones) skips the whole trait-glossary step, rather
than needing a lang fixture it doesn't care about.

## Fetching

`fetchUpstream.ts` runs, against a fresh target directory:

1. `git init`, add `origin` pointed at `UPSTREAM_REPO`
2. `git sparse-checkout init --cone` + `set packs static/lang` -- only those
   two directories are fetched, not upstream's full working tree
3. `git config core.longpaths true` -- upstream has at least one path deep
   enough to hit Windows' legacy `MAX_PATH` limit without this (hit directly
   during this importer's own development, not a hypothetical)
4. `git fetch --depth 1 origin <UPSTREAM_COMMIT>`, then `git checkout
   FETCH_HEAD`

`buildFetchCommands` returns this exact sequence as plain argv arrays,
separately from `fetchUpstream` actually running them -- so the sequence
itself is unit-tested without a real git process or network access, the
same split `apps/server`'s `applyMigrations`/`runMigrations` uses.
`fetchUpstream` itself is exercised for real by the importer CLI and CI's
`import-smoke` job, not by a hermetic unit test (ADR 0013).

## Verifying

`checksum.ts`'s `checksumPacks(dir)` hashes every file under `dir`: sha256
over each file's path and bytes, in sorted (POSIX-normalized) order, so the
result doesn't depend on host OS or the order files happened to be written
in. Returns `sha256:<hex>`.

The importer compares this against `UPSTREAM_PACKS_CHECKSUM` after every
fetch. A mismatch is a hard failure -- the importer refuses to proceed
rather than import content nobody has reviewed.

`checksumFile(path)` is the same idea for a single fixed file rather than a
directory: sha256 over just `static/lang/en.json`'s bytes, no path mixed
in (unlike `checksumPacks`, there's no directory membership to be sensitive
to -- it's one pinned file). Compared against `UPSTREAM_LANG_CHECKSUM` the
same way, and the same hard failure on a mismatch, whenever the trait
glossary step runs at all (see "The trait glossary" below).

## Reading

`reader.ts`'s `readUpstreamEntries(packsDir)` walks every `.json` file under
the fetched `packs/` directory into a loose shape:

```ts
{ path: 'feats/toughness.json', id: '...', name: 'Toughness', type: 'feat', system: {...} }
```

`system` is `unknown` -- nothing at this stage validates against our own
schemas (that starts at the license filter, the next PR) or interprets
Foundry's document types (that stays confined to the mapping stages, ADR
0004 decision 3). This module only reads JSON; it does not know what any of
it means.

**Malformed JSON is an error, not a skip** -- a file that fails to parse
means something is wrong with the fetch or the pin. **A well-formed file
that isn't an entry at all is skipped silently**: upstream's `_folders.json`
files are the real example, each one a JSON *array* of folder metadata
rather than a single object shaped like an entry. The array-vs-object check
is what distinguishes them, not the presence of `type` -- a Foundry folder
object can carry its own `type` field (the *content* type it organizes), so
checking for `type` alone would not have been enough.

Entries are returned sorted by path, so downstream stages see a
deterministic order regardless of the filesystem's own directory-listing
order.

## The license filter (ADR 0003)

`licenseFilter.ts`'s `applyLicenseFilter(entry)` is the first of the two
filters (the scope filter is next). It looks for a publication object at
either of two paths upstream actually uses -- confirmed against a real
fetch, not assumed:

- **Item**-type entries (feat, weapon, spell, ...): `system.publication`
- **Actor**-type entries (npc, hazard, character): `system.details.publication`

Both carry the identical shape (`{ title, license, remaster }`); a real
entry only ever has one. Whichever is found gets reshaped onto
`@hearthtable/core`'s `provenanceSchema` field names (`title` ->
`publication`) and validated against it directly -- reusing that schema's
own ORC/remaster enforcement rather than re-implementing the check here.

**Fails closed**: no publication found, an unrecognized license, or
`remaster: false` are all rejected with a reason (`missing-provenance` or
`not-orc-remaster`); nothing is included by default.

```ts
type LicenseFilterResult =
  | { ok: true; provenance: Provenance }
  | { ok: false; reason: string };
```

## The scope filter (ADR 0006)

`scopeFilter.ts`'s `applyScopeFilter(provenance)` runs after the license
filter -- it only has a `Provenance` to check because that filter already
produced one. The allow-list is the exact title strings real upstream data
uses:

```ts
PUBLICATION_ALLOW_LIST = [
  'Pathfinder Player Core',
  'Pathfinder Player Core 2',
  'Pathfinder GM Core',
  'Pathfinder Monster Core',
]
```

Confirmed against a real fetch, not assumed -- these carry the "Pathfinder "
prefix, which a guess from the book covers alone ("Player Core") would have
missed entirely. **Adding a book is a one-line change to this array plus a
reviewed PR** (ADR 0006) -- exactly enough friction to make it deliberate,
never accidental. An exact match only: a title one character off (a typo, a
future "Player Core 3") fails closed like anything else not on the list.

## The rule-element mapper (ADR 0004)

`mapPredicate.ts` and `elementMapper.ts` are the only two modules in the
entire repository that know Foundry's rule-element format exists. Nothing
downstream of them may.

`mapRuleElement(raw)` maps one upstream element (from an item's
`system.rules` array) onto [rule-elements.md](rule-elements.md)'s v1 subset,
or to `inert` with a `reason` when it can't be represented.

**`GrantItem` is special.** Its `uuid` names another upstream document, and
resolving that to one of *our* compendium entries (`{ packId, slug }`) needs
the full imported entry set -- something a single-element mapper doesn't
have. This stage produces an `UnresolvedGrantItem` carrying the raw `uuid`;
the dependency-resolution pass (a later PR) finishes the job.

**A known v1 gap, surfaced rather than worked around:**
`grantItemElementSchema` and `choiceSetElementSchema` have no `predicate`
field in `@hearthtable/core` -- neither was expected to need conditional
application. Real upstream data can predicate both. Silently dropping the
predicate would turn a conditional grant or choice into an unconditional
one, a wrong answer rather than a missing one -- so a predicated `GrantItem`
or `ChoiceSet` goes `inert` instead, with a reason that names exactly why.
If the coverage report (a later PR) shows this is common, that's the
evidence to add the field to `@hearthtable/core` -- not a guess made here.

Upstream's `predicate` is itself an array (an implicit AND); `mapPredicate.ts`
maps it onto a single `Predicate` value, failing the *whole* predicate (never
just dropping one clause) when any element uses an operator our v1 language
doesn't support (`gt`/`gte`/`lt`/`lte`/`eq`, `xor`/`nand`/`nor`).

## Per-entry rule-element mapping

`mapRuleElements.ts`'s `mapEntryRuleElements(rules)` runs `mapRuleElement`
over one entry's full `system.rules` array and separately collects the
inert results as `downgrades` -- `{ upstreamKind, reason }` pairs, flattened
for counting. `downgrades` is a view, not a second source of truth: every
downgrade also appears in `elements`, since inert elements are never
dropped (ADR 0004 decision 4). This is the raw material the coverage report
(a later PR) groups and counts.

An absent or `null` `rules` field -- most entries carry no automation at
all -- maps to no elements and no downgrades; it is not an error. A present
but non-array value (which real upstream data never produces) is one
`malformed-rules-array` downgrade.

## Content mapping and draft entries

Per-kind mappers (`mapFeat.ts`, `mapAction.ts`, and the ones that follow them
across the rest of Stack C) turn a license-and-scope-filtered upstream entry
into a **draft** content entry, not yet the fully schema-validated thing.

**Why a draft, not the real thing yet:** an entry's `ruleElements` may
contain an `UnresolvedGrantItem` (from the element mapper), which is not a
valid member of `@hearthtable/core`'s `ruleElementSchema` union. Resolving a
grant's upstream `uuid` into one of *our* compendium entries needs the full
imported entry set, which a single-entry mapper doesn't have -- that's the
dependency-resolution pass, a later PR. Only once every grant is resolved
can an entry be validated against its real Zod schema; the writer (a later
PR) is what does that, after resolution runs. `DraftEntry<T>` is the shared
type for this: identical to the real entry except `ruleElements: readonly
MappedElement[]` instead of `readonly RuleElement[]`.

**Deterministic ids.** `compendiumEntrySchema.id` requires a real UUID, but
importing the same upstream commit twice must produce the same ids --
otherwise a rerun is never byte-identical, and anything referencing an entry
by id would break on the next import. `deterministicId.ts` derives a UUID v5
(RFC 4122, name-based, SHA-1) from an entry's upstream `_id`, implemented
directly against `node:crypto` rather than adding a dependency. Verified
against the well-known `uuid` npm package's output for the same input during
development (not shipped as a dependency) -- worth doing for a hand-rolled
cryptographic-adjacent algorithm rather than trusting internal
self-consistency alone.

**Fields not yet verified against real data**, each marked `(confirm)` in
its mapper: `system.level.value`, `system.category`,
`system.prerequisites.value` (assumed to be `{ value: string }[]`, with a
plain-string-array fallback in case that's wrong), and
`system.actionType.value` / `system.actions.value`. A wrong path fails
closed (`ok: false` with a reason) rather than importing a garbage field,
which is what makes deferring real-data verification to the `import-smoke`
CI job (ADR 0013) safe.

**Slugs** use `system.slug` when present, falling back to a slugified name
(`slugify.ts`) -- matching how Foundry itself derives one when absent.

**A shared result shape** (`MapContentResult<T>`, in `draftEntry.ts`) is
used by every per-kind mapper: `{ ok: true, entry }` or `{ ok: false,
reason }`, the same convention every other importer stage uses.

### The weapon mapper (C.7b)

`mapWeapon.ts` follows the same pattern. Two more upstream field paths,
also `(confirm)`: `system.usage.value` (`"held-in-two-hands"` maps `hands`
to 2; anything else defaults to 1) and `system.reload.value` (a string --
`"0"`, `"-"`, absent, or unparsable all mean no reload step).

`parseDieSize` (the `"d8"` -> `8` parser) moved from `elementMapper.ts` into
`upstreamHelpers.ts` once this mapper became its second real caller.

### The armor and gear mappers (C.7c)

`mapArmor.ts`: same pattern, with one deliberate asymmetry worth calling
out. `dexCap: 0` is kept as a real value (heavy armor commonly allows no
Dexterity bonus at all), but `strength: 0` is treated as "no requirement" --
upstream uses 0 there to mean "none set," since a real Strength score is
never actually zero. Treating both the same way would either lose a real
dex cap of 0 or invent a strength requirement that doesn't exist.

`mapGear.ts` is the simplest mapper in the whole importer, matching
`gear.ts`'s own minimalism: no kind-specific fields to extract at all,
beyond the envelope every mapper already carries.

### The spell mapper (C.7d)

`mapSpell.ts` is the most involved content mapper, because upstream stores
several spell fields as loosely-structured or free-text strings where our
schema wants a real structure -- every parse below is `(confirm)`, and a
failed parse fails the whole entry closed rather than guessing:

- `range.value` is a human-readable string (`"30 feet"`, `"touch"`,
  `"self"`, `"unlimited"`), parsed into the discriminated `SpellRange`.
- `time.value` is `"1"`/`"2"`/`"3"`/`"reaction"`/`"free"` for the common
  case (translated to our `ACTION_COSTS` vocabulary) or free text for a
  slower cast (passed through unchanged).
- `area` is `{ value, type }`, close enough to our own `{ shape, size }`
  shape to map directly.
- **`sustained` comes from the `sustained` trait**, not a separate field --
  upstream tags a sustained spell in its traits list rather than a distinct
  boolean.
- `defense.save.{statistic,basic}` maps to our `{ save, basic }`.

**Heightening is deliberately never mapped.** Upstream's heightened effects
are typically prose embedded in the main description under a "Heightened
(+1)" / "Heightened (4th)" sub-heading, not separated into the structure
`spellHeighteningSchema` wants. Guessing at extracting that from HTML risked
being wrong in a way nobody would notice; omitting it loses nothing, since
the full prose (heightening included) is still in `description` -- it just
isn't separately structured. Revisit once real data shows what
`system.heightening` actually contains.

### The ancestry, heritage, and background mappers (C.7e)

`mapAncestry.ts`: upstream's `size` is an abbreviated code (`"sm"`, `"med"`,
`"lg"`, ...), mapped via `SIZE_CODE_TO_SIZE` to our full-word `Size`. Boosts
and flaws use `extractBoostSlots` (`upstreamHelpers.ts`, shared with the
background mapper): each slot names its eligible attributes, a single-
attribute slot is a fixed boost, more than one is a free-choice slot.

`mapHeritage.ts` handles the ancestry reference **defensively rather than
via the `GrantItem`-style resolution mechanism**: it tries a plain string,
then an object's `slug`, then a slugified `name`, and **fails the whole
entry closed** if none of those fit -- rather than silently falling back to
"versatile," which would let a player pick a heritage their ancestry
shouldn't have access to. A genuinely absent reference (no key at all) is a
confident, correct "this is versatile," not a parse failure.

`mapBackground.ts`: a background's boost slots are (in the common case) one
constrained choice plus one universal free slot (all six attributes
eligible) -- `boostOptions` wants the constrained one, identified as the
slot with fewer than six eligible attributes. The granted skill feat needs
no special handling: it's an ordinary `grantItem` rule element, already
covered by `mapEntryRuleElements`.

### The class and class-feature mappers (C.7f)

`mapClass.ts` is the most speculative mapper so far: `classEntrySchema`'s
proficiency progressions (perception, saves, class DC, weapon and armor
categories -- thirteen tables in total) have no confirmed upstream
counterpart yet, so the mapper reads a hypothetical
`system.{perception,savingThrows,classDC,weapons,armor}` shape that mirrors
our own schema field-for-field, via a shared `readProgression` helper that
validates each table against `proficiencyProgressionSchema` itself. A
malformed table (a higher rank reached before a lower one) fails the whole
class closed with `invalid-proficiency-progression`, rather than importing
a progression the resolver could misread later. Every field path here is
**(confirm)** against the real-data importer run.

`mapClassFeature.ts` treats its class reference the same defensive way
`mapHeritage.ts` treats an ancestry reference (bare slug, object `slug`, or
a slugified `name`) -- but unlike a heritage's ancestry link, `classSlug` is
**required** by the schema, so a missing or unparseable reference fails the
entry closed rather than falling back to any default: there is no such
thing as a class feature with no class.

### The creature mapper (C.7g)

**A creature's strikes live outside `system`.** Every other mapper reads
only `entry.system`, but a creature is an Actor whose attacks are sibling
embedded Items (type `melee`), not fields nested inside its own `system`
blob. `reader.ts` now carries that embedded array as `UpstreamEntry.items`
(optional, so every earlier mapper's hand-built fixtures keep typechecking
without change) and `mapCreature.ts` is the first, and so far only, mapper
to read it.

Because there is no per-element "downgrade" channel for strikes the way
rule elements have one, an embedded `melee` item this mapper can't fully
parse **fails the whole creature closed** rather than importing a stat
block missing (or worse, silently wrong about) one of its attacks. Supple-
mentary fields -- resistances, weaknesses, skills -- get the opposite
treatment: a malformed entry among them is dropped individually, the same
lenience `filterValidTraitSlugs` already gives traits, since losing one
skill bonus is a visible gap, not a wrong number the GM would trust.

`mapSizeCode` (shared with `mapAncestry.ts`, moved into `upstreamHelpers.ts`
in this PR) reads the size code from `system.traits.size.value` here,
rather than the top-level `system.size` an ancestry uses -- both feed the
same size-code table, just at different upstream paths. Every field path in
this mapper is **(confirm)** against the real-data importer run; a creature
stat block is the highest-stakes place in the importer to get that wrong,
since a GM trusts it at the table without checking it against a book.

### The condition mapper (C.7h)

The last of the per-kind content mappers. `system.value.isValued` is
assumed present on **every** condition item, valued or binary alike --
Foundry's own condition data template applies that field uniformly, so
relying on its presence rather than treating a missing `system.value` as
"must be binary" means a wrong assumption here fails every condition
closed together, visibly, instead of a subset silently importing with the
wrong `valued` flag. **(confirm)** against real upstream data.

`maxValue`, `group`, and `overrides` are all optional in
`conditionEntrySchema`, and stay optional here: none of the three is
load-bearing enough to sink the whole entry the way a missing damage block
is for a weapon, so a missing or malformed value for any of them just
means "this condition doesn't have one." A max value is also only ever
carried through for a valued condition -- present on a binary one is
ignored outright, matching the schema's own refinement that `maxValue`
only applies when `valued` is true.

## Dependency resolution (ADR 0003 decision 5)

`resolveDependencies.ts` is what finally turns a `DraftEntry<T>` into the
real, schema-valid thing (`DraftPf2eEntry` in, `Pf2eEntry` out), using the
full set of entries that survived the license and scope filters -- the
"full imported entry set" no single-entry mapper has.

**Every `UnresolvedGrantItem` gets resolved or the entry is dropped.** A
grant's upstream `uuid` names another upstream document by its trailing
`_id` segment; `deterministicId` on that same segment is exactly the id the
target entry was given when *it* was mapped, so resolving a grant is a
single map lookup, no separate id-translation table needed. If the target
isn't in the kept set -- excluded by an earlier filter, or dropped in an
earlier round of this same pass -- the granting entry is dropped whole
(`grant-target-excluded`), never silently stripped of the reference: ADR
0003 decision 5 is explicit that this would change what the entry does.

**Two more structural references get the same treatment**, since both are
real cross-entry dependencies this importer produces, not upstream ones: a
`heritage`'s `ancestrySlug` (`ancestry-excluded` if the named ancestry
isn't kept) and a `classFeature`'s `classSlug` (`class-excluded`
likewise). A heritage with no `ancestrySlug` at all is confidently
versatile, not a dependency, and is never dropped for this reason.

**The pass runs to a fixed point, because dropping cascades.** Dropping an
entry can orphan another entry that granted *it* -- if A grants B grants C,
and C was excluded before this pass even started, round 1 drops B (its
grant target is gone) and round 2 drops A (its grant target, B, is now
gone too). Each drop is recorded with its `round`, which is what a
`coverage.md` report (a later PR) can use to show the cascade, not just
the final casualty count. The pass stops once a full round drops nothing.

**Deliberately not attempted:** resolving `@UUID[Compendium...]` links
embedded in prose `description` text, and matching free-text
`prerequisites` strings against excluded content by name. Both would mean
trusting a drop decision to HTML/prose parsing or fuzzy name-matching --
the same risk `mapSpell.ts` already declined for heightening. Guessing
wrong here is worse than doing nothing: either an orphaned reference ships
anyway, defeating the whole pass, or unrelated content gets dropped for no
real reason. Revisit if a real-data survey shows either one matters.

## The writer (ADR 0012)

`writePacks.ts` is the final stage: every entry it receives has already
passed both filters, its mapper, and dependency resolution, so it should
already be a valid `Pf2eEntry`. It's re-validated against
`pf2eEntrySchema` one more time regardless -- not because upstream data
might still be bad (every earlier stage already fails closed on that), but
because a mismatch here means a bug in *this importer*, and that deserves
a loud crash while writing, never a silently malformed pack file left on
disk afterward.

**Flat files, not a database (ADR 0012).** Entries are grouped by
`packId` and written one JSON file per entry at
`<outputDir>/<packId>/<slug>.json`, plus one `pack.json` manifest per pack
recording the upstream pin, an entry count, and `generatedAt`.

**A duplicate `packId`/`slug` pair keeps the first entry and drops the
rest, rather than silently overwriting or throwing.** A real-data run
turned up upstream entries that legitimately collide -- a
`bestiary-ability-glossary-srd` compendium reprints common actions like
"Reactive Strike" under the same name as the real `actions` compendium's
own copy, purely for a creature stat block to link to. See
`docs/rulings.md`'s "Duplicate upstream slugs" entry for the policy
(first entry by upstream file path wins, deterministically) and why
throwing was wrong: it turned a real, ~1% occurrence in real data into an
importer that could never finish a real run at all. Every dropped entry is
recorded with reason `'duplicate-slug'` in the same coverage-report bucket
`resolveDependencies`'s drops use -- "never quietly lose content" still
holds, it just means "recorded," not "the import refuses to proceed."

**Pure with respect to time.** `generatedAt` is a parameter the caller
supplies, not `new Date().toISOString()` computed inside `writePacks`
itself -- the same convention every mapper's own `importedAt` parameter
already follows. Given the same entries, upstream pin, and `generatedAt`,
two runs produce byte-identical output; nothing in this module reaches for
the wall clock, which is exactly what the milestone's "a second run is
byte-identical" verification step needs to be true.

## The trait glossary (ADR 0020 decision 5)

Traits (`agile`, `finesse`, ...) have no description anywhere in `packs/` --
upstream keeps that text in `static/lang/en.json` instead, under keys like
`PF2E.TraitDescriptionAgile`, and that file isn't filtered by source book
the way `packs/` is. `traitGlossary.ts` is this project's own mitigation:
it writes a glossary entry **only for a trait slug at least one already
kept, already-filtered entry carries**, never upstream's full list.

- `flattenLangStrings(json)` flattens `en.json`'s nested object into dotted
  keys (`'PF2E.TraitDescriptionAgile' -> '...'`), once per run.
- `traitLangKey(slug)` is the slug-to-key heuristic: upstream derives its
  key from a trait's *display name*, not its slug, so a weapon-trait slug's
  parametrized suffix -- a die size (`two-hand-d8`, `deadly-d10`) or a
  damage-type letter (`versatile-p`) -- has to be stripped before
  PascalCasing what's left, because the description doesn't vary by it.
  It's a heuristic, not a lookup table: a slug like `splash-10`, whose own
  key (`TraitDescriptionSplash10`) keeps its number, won't resolve. A miss
  is not a failure -- see below.
- `buildTraitGlossary(traitSlugs, langStrings)` resolves every slug it can,
  converting each description through the same `htmlToRichText` the
  content mappers use (trait descriptions carry no inline syntax in
  practice, so `applyInlineSyntax` isn't needed here), and returns the
  slugs it couldn't as `misses` -- shown to a player as a bare trait name,
  never a broken tooltip, per ADR 0020 decision 6.
- `writeTraitGlossary(entries, outputDir)` writes `<outputDir>/traits.json`:
  a plain array, no per-entry files and no manifest, unlike `writePacks.ts`
  -- this is one short, flat list, not a pack a world imports from.

**Skipped entirely with no `langChecksum`.** `runImporter.ts` only runs any
of this when `options.upstream.langChecksum` is set; every hermetic test
but the trait-glossary ones cares only about `packs/`, and the real
importer (`index.ts`) always supplies `UPSTREAM_LANG_CHECKSUM`. Misses feed
into the coverage report below as `traitMisses` (detailed) /
`traitMissCount` (aggregate) -- the same detailed/aggregate split every
other slug-bearing field in that report already uses.

## The coverage report (ADR 0004 decision 5)

`coverageReport.ts` answers CLAUDE.md's open question -- "which
rule-element types beyond the v1 subset are worth the cost" -- with real
numbers instead of a guess, once the real-data importer run (C.11, a later
PR) produces some. `buildCoverageReport(entries, drops)` is a pure function
over the final kept entry set and `resolveDependencies`'s drop list; it
needs no new plumbing anywhere upstream, because everything it counts is
already sitting in those two values:

- **Entries by publication**, from each entry's own `provenance`.
- **Rule elements by kind**, tallying every non-`inert` element across
  every entry's `ruleElements` -- `flatModifier`, `damageDice`,
  `rollOption`, `grantItem`, `choiceSet`.
- **Inert rule elements, grouped by `(upstreamKind, reason)`** -- e.g. how
  many `FlatModifier`s went inert specifically for `formula-value` versus
  every other reason. Grouped, never per-entry, so this list is already
  aggregate-safe on its own.
- **Every dependency drop**, sorted by round then slug, so the cascade the
  "Dependency resolution" section above describes is visible in the report
  itself, not just the final casualty count.

**Two projections, two audiences.** The detailed `CoverageReport` names
dropped entries by slug -- fine for `coverage.md`, which a maintainer reads
locally, but a slug derives from Paizo's published content, so this shape
must never be printed by CI. `aggregateCoverage(report)` strips every name
down to bare counts (`dropsByReason`, `dropsByKind`, `dropsByRound`) --
the only shape CI's `import-smoke` job (a later PR) is allowed to print,
per the milestone's plan.

`writeCoverageReport(report, outputDir)` writes both `coverage.json` (the
detailed report, machine-readable) and `coverage.md` (`renderCoverageMarkdown`'s
rendering: a summary, then one section per breakdown above, with a table
for drops and `_none_` placeholders for empty sections rather than blank
tables) -- the same file-writing shape `writePacks.ts` already established.

## The CLI

`systems/pf2e/src/importer/index.ts` wires every stage above into one run:
fetch (unless `--skip-fetch`), verify the checksum, read, filter, map,
resolve dependencies, write packs, write the coverage report, print a
summary. Run it with:

```
pnpm --filter @hearthtable/pf2e run import          # full run, fetches first
pnpm --filter @hearthtable/pf2e run import -- --skip-fetch   # reuse .data/upstream/
```

**It has to be `run import`.** `pnpm import` is a built-in pnpm command (it
converts another package manager's lockfile), so without `run` pnpm answers
"No lockfile found" and never reaches this script.

The run needs network access (it fetches the pinned upstream `packs/` with git)
and takes a couple of minutes. It writes only to the git-ignored
`systems/pf2e/.data/` folders. The server reads `.data/imported/` once at
startup (ADR 0015), so **restart the server after an import** to see the content.
and takes a minute or two. It writes only to the git-ignored
`systems/pf2e/.data/` folders. **A GM does not need this command:** the table
has an "Import game content" button that runs this same importer and reloads
the server's compendium with no restart ([content-import.md](content-import.md),
ADR 0016). Run the command yourself when you are working on the importer; if you
do, the running server only sees the result after a restart or after the GM
imports from the table.
The first real run (2026-09-30) read 34,102 upstream entries and kept 3,107
across ten packs; the server loads them in under a second.

**Split the same way `apps/server/src/index.ts` splits from `app.ts`.**
`runImporter.ts` holds the actual pipeline as one plain, testable function
-- no top-level side effects, safe to import from a test, exercised by
`runImporter.test.ts` against a small on-disk `packs/` fixture this test
builds itself (never real upstream data). `index.ts` is the only file that
reads the environment and argv, calls it for real, and sets a nonzero exit
code on failure; it is deliberately never imported by a test, the same as
its server counterpart.

**The upstream pin is a parameter, not a constant `runImporter` reaches
for itself** -- `index.ts` is the one real caller, and it's the one that
supplies `upstream.ts`'s actual `UPSTREAM_REPO` / `UPSTREAM_COMMIT` /
`UPSTREAM_PACKS_CHECKSUM`. Passing it in (the same way `writePacks` already
takes an `UpstreamPin`) is what makes `runImporter` testable at all: a test
fixture's checksum is computed for that fixture, never for a real fetch.

**Dispatches to a mapper by the upstream entry's `type`** (`feat` ->
`mapFeat`, `npc` -> `mapCreature`, and so on for all thirteen kinds).
**A `type` with no mapper is not a filter rejection** -- it may well be
Remaster, core-four-books content that this project simply hasn't built a
content schema for yet. A GM Core hazard is the real example: Stack B never
added a `hazard` content kind, so every `hazard`-type entry that passes
both filters is counted separately
(`RunImporterSummary.noMapperForType`) rather than silently landing in the
same bucket as a license or scope rejection, or silently vanishing
altogether.

**The printed summary is aggregate-only, like the coverage report's own
projection**: counts, and upstream `type` / mapping-failure-reason strings
-- never an entry's name or slug. `coverage.md`, which does name entries,
is written to disk for a maintainer to read locally and is never echoed to
this console.

## Re-pinning

To move the pin to a new upstream commit:

1. Update `UPSTREAM_COMMIT` in `upstream.ts` to the new SHA.
2. Run the importer CLI (above) against that commit, without
   `--skip-fetch`.
3. Run `checksumPacks` against the fetched `packs/` directory (or read the
   mismatch the CLI itself reports if the old checksum is still in place).
4. Update `UPSTREAM_PACKS_CHECKSUM` in `upstream.ts` to the result.
5. Run `checksumFile` against the fetched `static/lang/en.json` the same
   way, and update `UPSTREAM_LANG_CHECKSUM` to that result.
6. Open a reviewed PR with all three changes together -- never one without
   the others, per ADR 0003's "re-importing is a deliberate, reviewed PR."

## Testing

- `checksum.test.ts`: determinism, order-independence, sensitivity to
  content changes and renames, nested directories, and the `sha256:` label
  format, for both `checksumPacks` (a directory) and `checksumFile` (one
  fixed file, unaffected by its own name).
- `fetchUpstream.test.ts`: the exact git command sequence -- sparse-checkout
  before fetch, long paths enabled, checkout after fetch, only `packs/` and
  `static/lang` requested.
- `traitGlossary.test.ts`: `traitLangKey`'s suffix-stripping heuristic
  (die-size, bare-number, single-letter, and the "never strip the only
  segment" edge case), `flattenLangStrings` on nested objects and on
  non-string/array values, `buildTraitGlossary` resolving, missing,
  deduplicating and sorting, and `writeTraitGlossary`'s plain-array output.
- `upstream.test.ts`: the pin is a real 40-character SHA and a real 64-hex
  checksum, not a placeholder.
- `reader.test.ts`: a well-formed entry read correctly, nested directories
  and non-JSON files handled, a folder-metadata array skipped without
  erroring, an incomplete object skipped, malformed JSON throwing with the
  offending file named, and deterministic path-sorted output. Fixtures are
  synthetic, invented entries -- never real upstream content (ADR 0013).
- `licenseFilter.test.ts`: an accept/reject table covering both provenance
  paths, OGL rejected, `remaster: false` rejected, a missing title rejected,
  no publication anywhere rejected, and a non-object/null `system` rejected;
  plus the mapped `Provenance` returned on success and a deterministic
  tie-break for the (unreal) case where both paths are somehow present.
- `scopeFilter.test.ts`: every allow-listed book accepted, real ORC/Remaster
  content outside the four books rejected (Rage of Elements), a near-miss
  title rejected rather than fuzzy-matched, and an empty publication
  rejected.
- `mapPredicate.test.ts`: single and multi-clause arrays, nested and/or/not,
  an unsupported comparison operator failing the whole predicate (even when
  only one of several clauses is the problem), and a non-array value
  rejected.
- `elementMapper.test.ts`: a well-formed case and every fail-closed path for
  each of the five kinds (a formula value, an unrecognized modifier type, an
  unsupported die size, a missing field, non-inline choices, a predicated
  grant or choice set), an unmapped element kind recorded by name, and a
  malformed (non-object) element.
- `mapRuleElements.test.ts`: an absent/null/empty rules field all producing
  nothing, a mix of mappable and unmappable elements preserving order and
  collecting only the inert ones as downgrades, a fully-mappable array
  producing no downgrades, the downgrade/elements consistency itself, and a
  non-array rules value producing exactly one downgrade.
- `deterministicId.test.ts`: determinism, different inputs producing
  different ids, a well-formed UUID with the right version/variant bits, and
  a match against the `uuid` npm package's output for a standard test input.
- `upstreamHelpers.test.ts`: every nested-field reader's happy path and
  failure modes, `slugify`'s punctuation handling, every `mapActionCost`
  case, and `filterValidTraitSlugs` dropping invalid entries.
- `mapFeat.test.ts` / `mapAction.test.ts`: a well-formed entry each, the
  slug fallback, both prerequisite shapes (feat only), an invalid trait
  filtered rather than failing the entry, rule elements (including inert
  ones) carried through, id determinism, and every fail-closed path
  (malformed system, missing/invalid level, unrecognized category, a
  missing or unrecognized action cost).
- `mapWeapon.test.ts`: one- and two-handed weapons, a ranged weapon with
  range and reload, `"-"` reload omitted, the slug fallback, and every
  fail-closed path (unrecognized category/group, an unsupported die size,
  an energy damage type rejected as a base type, a missing damage block).
- `mapArmor.test.ts` / `mapGear.test.ts`: light and heavy armor, `dexCap: 0`
  kept as a real value, `strength: 0` treated as no requirement, unarmored
  armor with no group, gear carrying rule elements through, the slug
  fallback, and every fail-closed path.
- `mapSpell.test.ts`: every range form (touch/self/unlimited/feet, singular
  and plural), every standard cast time plus a non-standard one passed
  through unchanged, an area, `sustained` derived from the trait, a basic
  save defense, heightening deliberately omitted even when upstream has one,
  the slug fallback, and every fail-closed path (a regression test here
  caught a real regex bug: `feet?` matches "fee"/"feet" but not "foot",
  which is a different word, not a missing letter).
- `mapAncestry.test.ts` / `mapHeritage.test.ts` / `mapBackground.test.ts`:
  human- and elf-shaped ancestries (all-free vs. fixed-plus-free boosts),
  every size code, a heritage with each parseable ancestry-reference shape
  and the confidently-versatile absent case, an unparseable reference
  rejected rather than downgraded to versatile, the constrained boost slot
  extracted for a background, its granted skill feat as an ordinary
  `grantItem`, and every fail-closed path.
- `mapClass.test.ts` / `mapClassFeature.test.ts`: a well-formed class with
  every proficiency table populated, a choice-of-key-ability class with more
  than one key attribute option, a class feature with each parseable
  class-reference shape, and every fail-closed path (missing key attribute,
  non-positive hp, a progression with ranks out of order, a missing trained
  skill count, and a missing or unparseable class reference).
- `mapCreature.test.ts`: a well-formed creature with a strike, other-speed
  types, resistances, and weaknesses; a creature with no strikes at all; a
  non-`melee` embedded item ignored rather than mapped; a level of `-1`; a
  malformed resistance entry dropped rather than failing the whole entry;
  and every fail-closed path (bad level, size, perception, AC, saving
  throws, hp, speed, attributes, and an unparseable embedded strike via both
  a missing attack bonus and an unsupported damage die size).
- `reader.test.ts` gained a case for the new `items` field: an actor's
  embedded items array is read through when present, and every existing
  case's expectation now includes `items: []` for entries that don't have
  one.
- `mapCondition.test.ts`: a valued condition with a max, a group, and
  overrides; a binary condition with none of those; a max value on a binary
  condition ignored rather than carried through; a non-string entry dropped
  from `overrides` rather than failing the whole condition; and every
  fail-closed path (a missing or non-boolean `isValued` flag).
- `resolveDependencies.test.ts`: a `grantItem` target that resolves,
  verified both directly and by parsing the resolved entry against its real
  per-kind schema; non-grant elements passed through unchanged; a broken
  grant dropping the whole entry even alongside other valid elements; an
  A-grants-B-grants-C chain dropping across two successive rounds when C
  was excluded from the start (and the mirror case where the whole chain
  resolves and nothing is dropped); a versatile heritage kept regardless of
  which ancestries exist; a heritage and a class feature each kept when
  their reference resolves and dropped when it doesn't.
- `writePacks.test.ts`: an entry written and read back identical to the
  input; a pack manifest with the right pin, entry count, and
  `generatedAt`; entries split into separate pack directories by `packId`;
  an unrecognized `packId` falling back to itself as the manifest name;
  byte-identical output verified directly across two separate output
  directories given identical input; an entry that fails its own schema
  throwing rather than writing bad output; and a duplicate `(packId,
  slug)` pair keeping the first entry, dropping the rest with reason
  `'duplicate-slug'`, and never colliding across two different packs.
- `coverageReport.test.ts`: counts by publication; mapped rule elements by
  kind with inert ones excluded; inert elements grouped by
  `(upstreamKind, reason)` and merged across entries; drops sorted by round
  then slug; `aggregateCoverage` stripping every slug down to bare counts
  (verified directly by asserting the serialized aggregate never contains a
  dropped entry's slug) while carrying every other field through unchanged;
  the rendered markdown naming publications, kinds, and dropped slugs, and
  falling back to `_none_` placeholders for empty sections; and
  `writeCoverageReport` producing a round-trippable `coverage.json` and a
  `coverage.md` containing the expected heading.
- `runImporter.test.ts`: an end-to-end run (against a synthetic on-disk
  `packs/` fixture built by the test itself) counting every outcome
  correctly in one pass -- a kept entry, a license rejection, a scope
  rejection, a `type` with no mapper, a mapping failure, and a
  dependency-resolution drop, all in the same six-entry batch; packs and
  both coverage report files actually written to `outputDir`; a checksum
  mismatch throwing rather than importing unverified content; and two
  entries sharing a slug counted as `duplicatesDropped` (not
  `dependencyDropped`) with only the first actually written.
