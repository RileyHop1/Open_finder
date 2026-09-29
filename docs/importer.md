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
