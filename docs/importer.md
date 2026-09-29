# The importer

Converts upstream `foundryvtt/pf2e` JSON into our own Zod-validated
compendium entries (`docs/compendium.md`). Licensing-critical -- read
[adr/0003-rules-data-licensing.md](adr/0003-rules-data-licensing.md) and
[adr/0006-content-scope-core-books.md](adr/0006-content-scope-core-books.md)
before touching it. Lives at `systems/pf2e/src/importer/`.

This page grows with the importer; right now it covers the fetch-and-verify
step (milestone 2, Stack C's first PR). The filters, mapping layer, coverage
report, and CLI are documented here as each lands.

## The pin

`systems/pf2e/src/importer/upstream.ts` names exactly what this importer
targets:

```ts
UPSTREAM_REPO = 'https://github.com/foundryvtt/pf2e.git'
UPSTREAM_COMMIT = '<40-character SHA>'
UPSTREAM_PACKS_CHECKSUM = 'sha256:<64 hex characters>'
```

Per [adr/0011-importer-pipeline.md](adr/0011-importer-pipeline.md), both the
commit and the checksum matter: the commit says *which* upstream state to
fetch, and the checksum independently verifies *what actually arrived* --
catching the case where a ref moved (force-push, deletion) and a fetch by
SHA would otherwise pull different bytes without any diff in this repo.

## Fetching

`fetchUpstream.ts` runs, against a fresh target directory:

1. `git init`, add `origin` pointed at `UPSTREAM_REPO`
2. `git sparse-checkout init --cone` + `set packs` -- only `packs/` is
   fetched, not upstream's full working tree
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

## Re-pinning

To move the pin to a new upstream commit:

1. Update `UPSTREAM_COMMIT` in `upstream.ts` to the new SHA.
2. Run `fetchUpstream` against that commit (via the importer CLI once it
   exists, or by hand using the same steps as "Fetching" above).
3. Run `checksumPacks` against the fetched `packs/` directory.
4. Update `UPSTREAM_PACKS_CHECKSUM` in `upstream.ts` to the result.
5. Open a reviewed PR with both changes together -- never one without the
   other, per ADR 0003's "re-importing is a deliberate, reviewed PR."

## Testing

- `checksum.test.ts`: determinism, order-independence, sensitivity to
  content changes and renames, nested directories, and the `sha256:` label
  format.
- `fetchUpstream.test.ts`: the exact git command sequence -- sparse-checkout
  before fetch, long paths enabled, checkout after fetch, only `packs/`
  requested.
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
