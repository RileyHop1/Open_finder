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
