# 0011. Importer pipeline: fetch by pinned SHA, verify by content checksum

- **Status:** Accepted
- **Date:** 2026-09-29
- **Relates to:** ADR 0003 (the licensing rules this pipeline enforces mechanically)

## Context
ADR 0003 requires two things of how the importer gets its input: a pinned
upstream commit, and a checksum of the downloaded packs, because a pin alone is
not enough — upstream can force-push or delete a ref, and a silent content
change would move golden test values with no diff in this repo. That decision
fixed the *properties* the fetch step needs; it did not fix the *mechanism*.

`foundryvtt/pf2e` is a large repository — the full history and working tree are
far bigger than the one directory (`packs/`) the importer actually needs — and
it is a third party we do not control. Whatever mechanism is chosen has to work
unattended in CI and by hand for a contributor re-pinning the data, without
adding a native dependency (ADR 0009, ADR 0010 both care about the dependency
tree staying free of anything that could complicate packaging).

## Decision
**Fetch the pinned commit with `git`, checksum the result ourselves.**

1. `git init` a throwaway working tree, add `foundryvtt/pf2e` as a remote,
   `git sparse-checkout set packs` (cone mode), then
   `git fetch --depth 1 origin <pinned-sha>` and check out `FETCH_HEAD`. Git
   itself verifies the fetched objects are what their hashes claim; this
   pipeline does not re-implement that.
2. The pin — `{ repo, commit }` — lives in one file
   (`systems/pf2e/src/importer/upstream.ts`) as a plain exported constant, not a
   config file, so changing it is an ordinary reviewed code change like anything
   else in this codebase.
3. After checkout, compute a **content checksum**: sha256 over every file under
   `packs/`, sorted by relative path, hashing the path and the bytes together
   (path first, so a rename is a different checksum even with identical
   content). This is a second, independent signal from the commit SHA — it
   catches the case ADR 0003 was worried about, where the ref itself has moved.
4. The computed checksum is compared against a value committed alongside the
   pin. A mismatch is a hard failure, not a warning: the importer refuses to
   proceed rather than silently importing content nobody has reviewed.
5. `--skip-fetch` lets a contributor re-run against an already-fetched
   `.data/upstream/` (still checksum-verified), so iterating on the mapping
   layer does not re-fetch on every run.

## Consequences
- **No new dependency.** `git` is already required to work on this repository
  at all, so this adds nothing to the dependency tree that ADR 0009 and ADR
  0010 are protecting.
- **Re-pinning is a two-line diff**: the commit SHA and the checksum, both in
  one file, both visible in the PR that changes them — exactly the "deliberate,
  reviewed PR" ADR 0003 asks re-imports to be.
- **The checksum is content-only, not history-only.** Verifying the SHA alone
  would only prove *which commit* was fetched; it says nothing about whether
  the fetched bytes match what was reviewed when the pin was last set, which is
  the actual failure mode (a force-push reusing the same ref name, or a
  checkout going wrong locally). Hashing content directly closes that gap.
- **Fetching still requires network access**, both for a contributor re-pinning
  and for the one CI job that runs the real import (see ADR 0013). This was
  already true and is not a new cost of this ADR.
- **Sparse checkout depends on the upstream repo's layout not moving `packs/`
  to a different path without notice.** Acceptable: a layout change would break
  the importer regardless of fetch mechanism, and re-pinning is already a
  reviewed process that would catch it.

## Alternatives considered
### Download a tarball of the pinned commit and extract it
GitHub serves a tarball for any commit SHA without needing a full git fetch,
and hashing the raw tarball bytes is an even simpler checksum story than hashing
a directory tree. Rejected: it needs a `tar` extraction dependency (Node has no
built-in tar reader), and an extractor is exactly the kind of dependency a
licensing-critical tool should not carry casually. Path-traversal safety in a
third-party tar library is also one more thing to audit for a tool that already
has to be trusted not to smuggle content in. `git`, which the project already
depends on for its own existence, does the same job with nothing new to add.

### Trust the pinned commit SHA alone, with no separate checksum
Simpler — one fewer value to maintain. Rejected outright by ADR 0003, which
already identified this as insufficient: a force-pushed or deleted ref is
exactly the failure mode a checksum exists to catch, and Git's own object
integrity guarantees only that the objects you received match their hashes,
not that the ref still points at the commit someone reviewed when the pin was
written.

### A full, non-sparse clone
Simplest to write, and closest to how a contributor might do it by hand.
Rejected on cost alone: `foundryvtt/pf2e`'s full working tree includes large
compiled and image assets the importer never reads, and a full clone in CI on
every re-pin is unnecessary network and disk cost for a one-directory need.
